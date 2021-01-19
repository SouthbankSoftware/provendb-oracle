/*
 * Encapsulates all the relevant functions for interacting with Oracle.
 *
 * Copyright (C) 2020  Southbank Software Ltd.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *
 * @Author: Guy Harrison
 */

const fs = require('fs');
const log = require('simple-node-logger').createSimpleLogger();
const oracledb = require('oracledb');
const assert = require('assert');
const crypto = require('crypto');
const tmp = require('tmp');
const stringify = require('json-stringify-safe');

const AdmZip = require('adm-zip');



const {
    sprintf
} = require('sprintf-js');
const {
    anchorData,
    getProofableClient,
    parseTrie,
    generateRowProof,
    validateData
} = require('./proofable');

oracledb.autoCommit = false;
let oraConnection = {};
const tableDefs = [];
module.exports = {
    // Connect to Oracle
    connectToOracle: async (config, verbose = false) => {
        log.trace('Connecting to Oracle...');
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            oraConnection = await oracledb.getConnection({
                connectString: config.oracleConnection.connectString,
                user: config.oracleConnection.user,
                password: config.oracleConnection.password,
            });
            log.trace('Connected to Oracle');
            if (verbose) {
                await module.exports.execSQL(oraConnection, 'begin dbms_session.session_trace_enable(waits=>TRUE);end;', false, verbose);
                await module.exports.execSQL(oraConnection, 'ALTER SESSION SET tracefile_identifier=proofable', false, verbose);
                const sqlt = `SELECT s.sql_trace, p.tracefile 
                                FROM v$session s JOIN v$process p ON (p.addr= s.paddr) 
                               WHERE audsid = USERENV ('SESSIONID')`;
                const result = await oraConnection.execute(sqlt);
                log.trace(result);
                const enabled = result.rows[0][0];
                const location = result.rows[0][1];
                log.trace(`SQL trace ${enabled} at ${location}`);
            }
            return oraConnection;
        } catch (error) {
            log.error(error.message, ' while connecting to oracle');
            throw (error);
        }
    },

    connectToOracleSYS: async (connectString, password, verbose = false) => {
        log.info('Connecting to Oracle as SYS...');
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            oraConnection = await oracledb.getConnection({
                connectString,
                user: 'sys',
                password,
                privilege: oracledb.SYSDBA
            });

            log.info('Connected to SYS');
            return oraConnection;
        } catch (error) {
            log.error(error.message, ' while connecting to oracle');
            throw (error);
        }
    },

    installPDB4O: async (connectString, sysConnection, provendbUser, provendbPassword, dropExisting,
        createDemoAccount, verbose = false) => {
        log.info('Installing ProvenDB for Oracle users and tables');
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            await module.exports.createUsers(sysConnection, provendbUser, provendbPassword, dropExisting,
                createDemoAccount, verbose);
            await module.exports.createProvendbTables(connectString, provendbUser, provendbPassword, verbose);
            await module.exports.createDemoTables(connectString, provendbUser, provendbPassword, verbose);
            log.info('Install complete');
        } catch (error) {
            log.error('Install failed ', error.message);
        }
    },

    createProvendbTables: async (connectString, provendbUser, provendbPassword, verbose = false) => {
        log.info('Installing ProvenDB user tables');
        if (verbose) {
            log.setLevel('trace');
        }
        log.trace(`Connecting to ${provendbUser} user `, connectString, ' ', provendbPassword)
        try {
            oraConnection = await oracledb.getConnection({
                connectString,
                user: provendbUser,
                password: provendbPassword
            });
        } catch (error) {
            log.error(error.message, ` connecting to ${provendbUser}  user`);
            throw (error);
        }
        log.info(`Connected to ${provendbUser} `);

        try {
            const sqls = [];
            // TODO: Rename these table to provendbcontrol
            sqls.push(
                `CREATE TABLE proofablecontrol (
                    owner_name   VARCHAR2(128) NOT NULL,
                    table_name   VARCHAR2(128) NOT NULL,
                    start_time   DATE NOT NULL,
                    end_time     DATE NOT NULL,
                    start_scn    NUMBER,
                    end_scn      NUMBER,
                    trieid       VARCHAR2(256),
                    trie         CLOB NOT NULL,
                    trieType     VARCHAR2(30) NOT NULL,
                    whereclause VARCHAR2(2000),
                    metadata     VARCHAR2(4000) CHECK (metadata IS JSON),
                    CONSTRAINT table1_pk PRIMARY KEY ( trieid )
                        USING INDEX (
                            CREATE UNIQUE INDEX table1_pk ON
                                proofablecontrol (
                                    trieid
                                ASC )
                        )
                    ENABLE)`);

            sqls.push(
                `CREATE INDEX proofablecontrol_i1 ON
                          proofablecontrol (
                              owner_name,
                              table_name,
                              start_time,
                              end_time)`);
            sqls.push(
                `CREATE TABLE proofablecontrolrowids (
                            trieid            VARCHAR2(256) NOT NULL,
                            rowid_scn   VARCHAR2(128) NOT NULL,
                            versions_starttime timestamp not null,
                            CONSTRAINT proofablecontrolrowids_pk 
                            PRIMARY KEY ( trieid,rowid_scn ) ENABLE)`);
            sqls.push(
                `ALTER TABLE proofablecontrolrowids
                          ADD CONSTRAINT proofablecontrolrowids_fk1 FOREIGN KEY ( trieid )
                              REFERENCES proofablecontrol ( trieid )
                          ENABLE`);
            sqls.push(
                `CREATE INDEX proofablecontrolrowids_i1 
                    ON proofablecontrolrowids(rowid_scn)`);

            for (let s = 0; s < sqls.length; s++) {
                await module.exports.execSQL(oraConnection, sqls[s], false, verbose);
            }
        } catch (error) {
            log.error('Install provendb user failed: ', error.message);
            throw (error);
        }
    },

    createDemoTables: async (connectString, provendbUser, provendbPassword, verbose = false) => {
        log.info('Creating demo tables');
        if (verbose) {
            log.setLevel('trace');
        }
        const provendbDemoUser = provendbUser + 'demo';
        log.trace('Connecting to provendbDemo user ', connectString, ' ', provendbPassword)
        try {
            oraConnection = await oracledb.getConnection({
                connectString,
                user: provendbDemoUser,
                password: provendbPassword
            });
        } catch (error) {
            log.error(error.message, ` connecting to ${provendbDemoUser} user`);
            throw (error);
        }
        log.info(`Connected to ${provendbDemoUser}`);

        try {
            const results = await oraConnection.execute('select default_tablespace from user_users');
            const defaultTablespace = results.rows[0][0];
            const sqls = [];
            sqls.push(
                ` CREATE TABLE contractsTable(
                      contractId   NUMBER PRIMARY KEY,
                      metaData     VARCHAR2(4000)
                        CHECK (metaData IS JSON),
                      contractData VARCHAR2(4000) NOT NULL,
                      mytimestamp TIMESTAMP
                    )`);

            sqls.push(
                ` CREATE TABLE contractsTableFBDA(
                              contractId   NUMBER PRIMARY KEY,
                              metaData     VARCHAR2(4000)
                                CHECK (metaData IS JSON),
                              contractData VARCHAR2(4000) NOT NULL,
                              mytimestamp TIMESTAMP
                            )`);
            sqls.push(
                `CREATE OR REPLACE TRIGGER contractsTable_proofable_trg 
                    AFTER INSERT OR UPDATE OR DELETE ON contractsTable
                    BEGIN 
                      DBMS_ALERT.SIGNAL('provendb_alert','proofable table modified'); 
                    END; `);
            sqls.push(
                `CREATE OR REPLACE TRIGGER contractsTableFB_proofable_trg 
                    AFTER INSERT OR UPDATE OR DELETE ON contractstablefbda
                    BEGIN 
                        DBMS_ALERT.SIGNAL('provendb_alert','proofable table modified'); 
                    END; `);
            sqls.push(
                'CREATE SEQUENCE contract_seq ');
            sqls.push(
                ` CREATE OR REPLACE PROCEDURE populatecontractsTable(n NUMBER) IS
                    counter INTEGER:=0;
                  BEGIN
                    WHILE counter < n LOOP
                      INSERT INTO contractsTable(contractId,metaData,contractData,mytimestamp)
                      values( contract_seq.nextval,'{"name":"A Name","Date":"A Date"}','jdfksljfdskfsdioweljdslfsdjlewowefsdfjl',sysdate);
                      counter:=counter+1;
                    END LOOP;
                    COMMIT;
                  END; `);
            sqls.push(
                `BEGIN
                    populatecontractsTable(100);
                    COMMIT;
                 END;`);
            sqls.push('INSERT INTO contractsTableFBDA SELECT * FROM contractsTable');
            sqls.push('commit');
            for (let s = 0; s < sqls.length; s++) {
                await module.exports.execSQL(oraConnection, sqls[s], false, verbose);
            }
            await module.exports.execSQL(oraConnection,
                `CREATE flashback archive ${provendbDemoUser} tablespace ${defaultTablespace} retention 1 month`,
                true, verbose);
            await module.exports.execSQL(oraConnection,
                `ALTER table contractsTableFBDA flashback archive ${provendbDemoUser} 
                     `,
                true, verbose);
        } catch (error) {
            log.error(`Install ${provendbDemoUser} user failed: `, error.message);
            throw (error);
        }
    },
    // Execute SQL with no result, ignoring all or certain errors.
    execSQL: async (oraConnection, sqlText, ignoreErrors, verbose = false) => {
        if (verbose) {
            log.trace('executing ', sqlText);
        }
        try {
            await oraConnection.execute(sqlText);
        } catch (error) {
            if (ignoreErrors === false) {
                log.error(error.message, ' while executing ', sqlText);
                throw (error);
            } else if ((Array.isArray(ignoreErrors) && ignoreErrors.includes(error.errorNum)) ||
                ignoreErrors === error.errorNum || ignoreErrors === true) {
                log.info(error.message, ' handled while executing ', sqlText);
            } else {
                log.error(error.message, ' while executing ', sqlText);
                throw (error);
            }
        }
    },

    createUsers: async (sysConnection, provendbUser, provendbPassword, dropExisting,
        createDemoAccount, verbose = false) => {
        try {
            const provendbDemoUser = provendbUser + 'demo';
            if (dropExisting) {
                log.info('Dropping existing users');
                await module.exports.execSQL(sysConnection, `DROP USER ${provendbUser} CASCADE`, 1918, verbose);
                if (createDemoAccount) {
                    await module.exports.execSQL(sysConnection, `ALTER TABLE ${provendbDemoUser}.contractstablefbda no flashback archive`, true, verbose);
                    await module.exports.execSQL(sysConnection, `DROP USER ${provendbDemoUser} CASCADE`, 1918, verbose);
                }
            }
            log.info(`Creating ${provendbUser}  user`);
            const sqls = [`CREATE USER ${provendbUser}  IDENTIFIED BY ` + provendbPassword,
                `GRANT CONNECT, RESOURCE, CREATE SESSION, SELECT_CATALOG_ROLE , UNLIMITED TABLESPACE, CREATE VIEW TO ${provendbUser} `,
                `GRANT SELECT ANY TABLE TO ${provendbUser} `,
                `GRANT ALTER SESSION to ${provendbUser} `,
                `GRANT FLASHBACK ANY TABLE  TO ${provendbUser} `,
                `GRANT execute_catalog_role TO ${provendbUser} `,
                `GRANT execute ON dbms_Session to ${provendbUser} `
            ];
            for (let s = 0; s < sqls.length; s++) {
                await module.exports.execSQL(sysConnection, sqls[s], false, verbose);
            }

            if (createDemoAccount) {
                log.info(`Creating ${provendbDemoUser}  account`);
                const sqls = [`CREATE USER ${provendbDemoUser} IDENTIFIED BY ` + provendbPassword,
                    `GRANT CONNECT, RESOURCE, CREATE SESSION, SELECT_CATALOG_ROLE , UNLIMITED TABLESPACE, CREATE VIEW TO ${provendbDemoUser}`,
                    `GRANT execute_catalog_role TO ${provendbDemoUser}`,
                    `GRANT execute ON dbms_alert TO ${provendbDemoUser}`,
                ];
                for (let s = 0; s < sqls.length; s++) {
                    await module.exports.execSQL(sysConnection, sqls[s], false, verbose);
                }
                const sqlText = `GRANT FLASHBACK ARCHIVE ADMINISTER TO ${provendbDemoUser}`
                await module.exports.execSQL(sysConnection, sqlText, true, verbose);
            }
        } catch (error) {
            log.error('Install users failed: ', error.message);
            throw (error);
        }
    },


    // Get data for a specific rowid key
    // A rowid Key is the in the format rowid.scn
    getRowData: async (tableOwner, tableName, rowidKey, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        log.trace('Getting data for ', rowidKey);

        const therowid = rowidKey.split('.')[0];
        const scn = rowidKey.split('.')[1];
        const tableOwnerName = `${tableOwner}.${tableName}`;
        const sqlText = `
        SELECT rowidtochar(c.rowid) AS row_rowid, c.*
          FROM ${tableOwnerName} AS OF SCN :scn c
         WHERE ROWID = :therowid`;

        log.trace(sqlText);
        let result;
        try {
            result = await oraConnection.execute(sqlText, {
                scn,
                therowid,
            });
        } catch (error) {
            if (error.errorNum === 8181) {
                log.error(`Cannot get data for SCN ${scn} - insufficient flashback data`);
                log.error('Consider implementing Flashback data archive or increase undo retention');
            }
            throw (error);
        }

        assert(result.rows.length === 1, 'Only one row returned for rowid_scn');
        const row = result.rows[0];
        const jsonRow = module.exports.ora2json(result);
        log.trace(jsonRow);

        const key = rowidKey;
        const hash = crypto.createHash('sha256').update(stringify(row)).digest('base64');
        return {
            key,
            hash,
            jsonRow,
            rawData: row
        };
    },

    /*
     * Massage table data and create key/hash pairs
     */
    processTableData: (result, currentScn, includeScn) => {
        try {
            let rowidIdx;
            let startTimeIdx;
            let startScnIdx;

            for (let mi = 0; mi < result.metaData.length; mi += 1) {
                if (result.metaData[mi].name === 'ROW_ROWID') {
                    rowidIdx = mi;
                }
                if (result.metaData[mi].name === 'VERSIONS_STARTTIME') {
                    startTimeIdx = mi;
                }
                if (result.metaData[mi].name === 'VERSIONS_STARTSCN') {
                    startScnIdx = mi;
                }
            }
            const keyValues = {};
            const keyTimeStamps = {};
            let maxStartTime = new Date('1900-01-01').getTime();
            let minStartTime = new Date().getTime();
            let maxStartScn = currentScn;
            let minStartScn = currentScn;
            result.rows.forEach((row) => {
                let key;
                let data;
                // log.trace('max/min SCN ', maxStartScn, ',', minStartScn);
                if (!includeScn) {
                    // log.trace('No SCN in row key');
                    key = row[rowidIdx];
                    maxStartTime = minStartTime;
                    data = row;
                    keyTimeStamps[key] = new Date().getTime();
                } else {
                    // log.trace('Attaching SCN to row key');
                    const versionStartTime = new Date(row[startTimeIdx]).getTime();
                    const versionStartScn = row[startScnIdx];
                    let keyScn = versionStartScn;
                    if (versionStartScn === null) keyScn = currentScn;
                    key = `${row[rowidIdx]}.${keyScn}`;
                    // log.trace('versionStartScn ', versionStartScn, ' ', typeof versionStartScn);
                    if (versionStartTime > maxStartTime) maxStartTime = versionStartTime;
                    if (versionStartTime < minStartTime) minStartTime = versionStartTime;
                    if (versionStartScn > maxStartScn) maxStartScn = versionStartScn;
                    if (versionStartScn > 0 && versionStartScn < minStartScn) {
                        minStartScn = versionStartScn;
                    }
                    // remove last three columns from data to be hashed - they are Flashback metadata
                    data = row.slice(0, row.length - 3);
                    keyTimeStamps[key] = versionStartTime;
                }
                const hash = crypto.createHash('sha256').update(stringify(data)).digest('base64');
                keyValues[key] = hash;

                log.trace('key: ', key, ' hash:', hash);
            });
            return {
                keyValues,
                keyTimeStamps,
                maxStartTime,
                minStartTime,
                maxStartScn,
                minStartScn,
            };
        } catch (error) {
            log.error(error.message);
            throw (error);
        }
    },

    /*
     *  Check that tables in the config file are valid
     */
    checkTables: async (tableList) => {
        log.info('Checking all tables...');
        const flashbackArchives = await oraConnection.execute(`
                SELECT flashback_archive_name,last_purge_time FROM dba_flashback_archive`);
        log.trace(flashbackArchives.rows);
        for (let ti = 0; ti < tableList.length; ti++) {
            const table = tableList[ti];
            const splitTable = table.split('.');
            if (splitTable.length !== 2) {
                throw new Error('Tables should be defined in User.TableName format');
            }

            tableDefs[table] = await module.exports.check1table(splitTable[0], splitTable[1]);
        }
        log.trace('tableDefs', tableDefs);
    },

    tableExists: async (user, table) => {
        const existsResult = await oraConnection.execute(
            `select COUNT(1) c 
         from all_tables where owner=:1 
          and table_name=:2`,
            [user, table],
        );
        const count = existsResult.rows[0][0];
        if (count === 0) {
            log.error(`Table ${user}.${table} is not accessible`);
        }
        return count === 1;
    },

    // Check a single table
    check1table: async (user, table) => {
        log.info('Checking ', user, '.', table);
        const tableData = {};
        tableData.tableOwner = user;
        tableData.tableName = table;
        if (await module.exports.tableExists(user, table)) {
            const fbdaData = await module.exports.getFBDAdetails(user, table);
            const MaxEndTimeResult = await oraConnection.execute(
                `SELECT MAX(end_time) MAXENDTIME from proofablecontrol
            WHERE owner_name=:1
             AND table_name=:2`,
                [user, table],
            );

            tableData.lastPurgeTime = fbdaData.lastPurgeTime;
            tableData.maxEndTime = MaxEndTimeResult.rows[0][0];
            tableData.exists = true;
            log.trace(tableData);
        } else {
            tableData.exists = false;
        }
        return tableData;
    },

    // See if this table is flashback data archive managed.
    getFBDAdetails: async (user, table) => {
        let tableData = {};
        const sqlText = `
    SELECT  flashback_archive_name,
            fa.last_purge_time,
            fat.table_name,
            fat.owner_name,
            fat.status
          FROM
            dba_flashback_archive          fa
            JOIN dba_flashback_archive_tables   fat USING ( flashback_archive_name )
          WHERE fat.owner_name=:1
            AND fat.table_name=:2`;
        const fatData = await oraConnection.execute(sqlText, [user, table]);

        let lastPurgeTime = new Date();
        if (fatData.rows.length > 0) {
            lastPurgeTime = new Date(fatData.rows[0][1]);
            log.info('Flashback Archive last Purge Time ', lastPurgeTime);
        }
        const jsonData = module.exports.ora2json(fatData); // JSON version of data
        if (jsonData.length === 0) {
            log.info(`${user}.${table} is not flashback managed`);
            tableData.hasFBDA = false;
        } else {
            tableData = jsonData[0];
            tableData.lastPurgeTime = lastPurgeTime;
            tableData.hasFBDA = true;
        }
        return tableData;
    },

    // Return an oracle result set as array of simple JSON
    ora2json: (oraOutput) => {
        const names = [];
        const rows = [];
        oraOutput.metaData.forEach((md) => {
            names.push(md.name);
        });
        log.trace(names);
        oraOutput.rows.forEach((row) => {
            log.trace(row);
            const jsonRow = {};
            for (let fi = 0; fi < row.length; fi++) {
                jsonRow[names[fi]] = row[fi];
            }
            rows.push(jsonRow);
        });
        log.trace(rows);
        return rows;
    },

    // Get table data as it currently exists
    getTableDataNoScn: async (tableName, where) => {
        let result;
        let whereClause = '';

        if (where) {
            whereClause = 'WHERE ' + where;
        }

        const sqlText = `
        SELECT rowidtochar(C.ROWID) as row_rowid,C.*  
            FROM ${tableName} C ${whereClause}
        `;
        log.trace(sqlText);

        try {
            result = await oraConnection.execute(sqlText);
        } catch (error) {
            log.error(error.message);
            throw (error);
        }
        return result;
    },

    // Get table data for a specific SCN range
    getTableDataScn: async (tableName, lastProofableAnchor, currentScn, adHoc, where) => {
        let sqlText;
        let startScn = currentScn;
        let result;
        let whereClause;

        if (where) {
            whereClause = 'WHERE ' + where;
        }

        if (adHoc) {
            sqlText = module.exports.firstTimeTableQuery(tableName, whereClause);
            startScn = currentScn;
        } else {
            if (lastProofableAnchor.tableRegistered) {
                sqlText = module.exports.registeredTableQuery(tableName, whereClause);
            } else {
                sqlText = module.exports.firstTimeTableQuery(tableName, whereClause);
            }
            log.trace('last max scn ', lastProofableAnchor.maxEndScn);

            if (lastProofableAnchor.maxEndScn !== null && lastProofableAnchor.maxEndScn > 0) {
                startScn = lastProofableAnchor.maxEndScn;
                // This is a second scan
            }
            log.info('Start SCN=', startScn, ' current SCN=', currentScn);
            log.trace(sqlText);
        }
        log.trace(sqlText);
        try {
            result = await oraConnection.execute(sqlText, {
                startscn: startScn,
                currentscn: currentScn,
            });
            log.trace(result.rows.length, ' rows retrieved');
        } catch (error) {
            log.error(error.message);
            if (error.errorNum === 30052) {
                // We don't have flashback data since the last monitored sample
                log.error('Insufficient flashback history to capture all changes since last sample');
                log.info('Attempting to retrieve current state');
                sqlText = module.exports.firstTimeTableQuery(tableName);
                result = await oraConnection.execute(sqlText, {
                    startscn: currentScn,
                    currentscn: currentScn,
                });
            }
        }
        // log.trace('Table Data ', result);

        return result;
    },

    // List known versions of a specific Rowid
    listEntries: async (rowid) => {
        try {
            const format = '%-18s %-22s %-26s %-24s %-24s';
            console.log('\n');
            console.log(sprintf(format, 'Rowid', 'Proof', 'key', 'startDate', 'endDate'));
            const rowidPattern = `${rowid}.%`;
            const sqlText = `
                SELECT rowid_scn,trieid,start_time,end_time 
                FROM proofablecontrolrowids 
                JOIN proofablecontrol USING(trieid)
                WHERE rowid_scn LIKE :1 or rowid_scn=:2
                ORDER BY start_time 
  `;
            const result = await oraConnection.execute(sqlText, [rowidPattern, rowid]);
            if (result.rows.length === 0) {
                log.error(`No proofs for ${rowid}`);
            } else {
  

                result.rows.forEach((row) => {
                    console.log(sprintf(format, rowid, row[1], row[0], row[2].toISOString(), row[3].toISOString()));
                });
            }
        } catch (error) {
            log.error(error.stack);
        }
    },

    // This is the query we use to get changes since the last sample
    registeredTableQuery: (tableName, whereClause) => {
        if (!whereClause) whereClause = '';
        const sqlText = `
            WITH table_versions AS (
                SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                        versions_startscn, versions_starttime, versions_operation 
                FROM ${tableName} VERSIONS BETWEEN SCN    
                :startscn 
                AND :currentscn C WHERE versions_startscn>=:startscn )
            SELECT * from table_versions ${whereClause}       
            ORDER BY versions_startscn`;
        return sqlText;
    },

    // This is the query we use to get the first sample of data
    firstTimeTableQuery: (tableName, whereClause) => {
        const sqlText = `
        WITH table_versions AS (
            SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                    NVL(versions_starttime,SYSDATE) versions_starttime, 
                    versions_operation ,versions_startscn
            FROM ${tableName} VERSIONS BETWEEN SCN :startscn                      
            AND :currentscn C)
        SELECT * from table_versions ${whereClause}
        ORDER BY versions_starttime`;
        return sqlText;
    },

    // Wait on a timeout but awake if someone fires the provendb_alert alert
    monitorSleep: async (timeout, config) => {
        log.info(`Sleeping for ${timeout} seconds `);
        if (config.dbmsAlert) {
            log.info('Will awake on dbms_alert');
            await oraConnection.execute(`
                DECLARE
                    status VARCHAR2(2000);
                    message VARCHAR2(2000);
                BEGIN
                    dbms_alert.register ('provendb_alert');
                    dbms_alert.waitone('provendb_alert',status,message,${timeout});
                END;`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); /* Race condition on FBDA */
        } else {
            await new Promise((resolve) => setTimeout(resolve, 1000 * timeout));
        }
    },

    // Process changes for all registered tables
    processTableChanges: async (config) => {
        log.info('Processing all table changes');

        const tableNames = Object.keys(tableDefs);
        for (let tableNo = 0; tableNo < tableNames.length; tableNo++) {
            const tableDef = tableDefs[tableNames[tableNo]];
            log.trace('Processing ', tableDef);
            const tableData = await module.exports.process1TableChanges(tableDef, false, null, true);
            if (Object.keys(tableData.keyValues).length > 0) {
                const anchoredTrie = await anchorData(tableData, config.anchorType);
                await module.exports.saveTrieToDB(
                    anchoredTrie.getTrieId(),
                    tableDef.tableOwner,
                    tableDef.tableName,
                    tableData,
                    'Monitor'
                );
            } else {
                log.info('No new data to anchor');
            }
        }
    },

    // Save a trie to the Proofable control table
    saveTrieToDB: async (trieId, tableOwner, tableName, tableData, trieType, whereclause, includeScn) => {
        try {
            log.info(`Saving trie ${trieId} to db`);
            const tmpFile = tmp.fileSync();
            const trieFileName = tmpFile.name;

            const proofableClient = await getProofableClient();
            await proofableClient.exportTrie(trieId, trieFileName);
            const trieData = fs.readFileSync(trieFileName, 'base64');

            // Create an array of bind variables for array insert
            const rowIdBindData = [];
            Object.keys(tableData.keyValues).forEach((key) => {
                // const timePart = new Date(Number(key.split('.')[1]));
                rowIdBindData.push([trieId, key, new Date(tableData.keyTimeStamps[key])]);
            });
            const metadata = {
                tableOwner,
                tableName,
                trieType,
                whereclause,
                currentScn: tableData.currentScn,
                includeScn
            };
            const insOut = await oraConnection.execute(
                `INSERT INTO proofablecontrol 
                        (trieId, trie, owner_name, table_name, 
                         start_time, end_time ,start_scn, end_scn,trieType,whereclause,metadata) 
                  VALUES(:1, :2, :3, :4, :5 , :6, :7, :8,:9,:10,:11)`,
                [
                    trieId,
                    trieData,
                    tableOwner,
                    tableName,
                    new Date(tableData.minStartTime),
                    new Date(tableData.maxStartTime),
                    tableData.minStartScn,
                    tableData.maxStartScn,
                    trieType,
                    whereclause,
                    JSON.stringify(metadata)
                ],
            );
            log.trace(`${insOut.rowsAffected} rows inserted into proofableControl`);

            const ins2Out = await oraConnection.executeMany(
                `INSERT INTO proofablecontrolrowids 
                 (trieId, rowid_scn, versions_starttime ) 
                  VALUES(:1, :2, :3 )`,
                rowIdBindData,
            );
            log.trace(`${ins2Out.rowsAffected} rows inserted into proofableControlrowids`);
            await oraConnection.commit();
        } catch (error) {
            log.error(error.message);
            throw (error);
        }
    },

    // Process changes for a single table
    process1TableChanges: async (tableDef, adHoc, where, includeScn) => {
        log.info('Processing ', ' ', tableDef.tableOwner, '.', tableDef.tableName, ' Where: ', where);
        if (where) {
            log.info('WHERE ', where);
        }

        const tableName = `${tableDef.tableOwner}.${tableDef.tableName}`;
        const currentScn = await module.exports.getSCN();
        log.trace('Current SCN ', currentScn);
        const lastProofableAnchor = await module.exports.getTableLastSCN(
            tableDef.tableOwner,
            tableDef.tableName,
        );
        log.trace(lastProofableAnchor);

        let rawTableData;
        if (adHoc && !includeScn) {
            rawTableData = await module.exports.getTableDataNoScn(tableName, where);
        } else {
            rawTableData = await module.exports.getTableDataScn(
                tableName,
                lastProofableAnchor,
                currentScn,
                adHoc,
                where
            );
        }
        // log.trace(rawTableData);
        const processedTableData = module.exports.processTableData(rawTableData, currentScn, includeScn);
        // log.trace(processedTableData);

        return {
            keyValues: processedTableData.keyValues,
            keyTimeStamps: processedTableData.keyTimeStamps,
            maxStartTime: processedTableData.maxStartTime,
            minStartTime: processedTableData.minStartTime,
            maxStartScn: processedTableData.maxStartScn,
            minStartScn: processedTableData.minStartScn,
            currentScn
        };
    },

    listTableEntries: async (tables, where) => {
        for (let ti = 0; ti < tables.length; ti++) {
            const tableName = tables[ti]

            let sqlText = `Select rowid from ${tableName}`
            if (where) {
                sqlText += ` WHERE ${where}`
            }
            log.trace(sqlText);
            const results = await oraConnection.execute(
                sqlText, {}, {
                    resultSet: true,
                    fetchArraySize: 1000
                }
            );

            console.log('Table: ', tableName);
            const divider = '-------' + '-'.repeat(tableName.length + 1);
            console.log(divider);
            const format = '%-18s %-22s %-26s %-24s %-24s';
            console.log(sprintf(format, 'Rowid', 'Proof', 'key', 'startDate', 'endDate'));
            let row = await results.resultSet.getRow();
            while (row) {
                const rowId = row[0];
                await module.exports.listEntries(rowId);
                row = await results.resultSet.getRow();
            }
            await results.resultSet.close();
        }
    },

    getSCN: async () => {
        const SQLText = `
            SELECT CURRENT_SCN,flashback_on
                FROM v$database`;

        const result = await oraConnection.execute(SQLText);
        const currentScn = result.rows[0][0];
        // const flashbackOn=result.rows[0][1];
        log.trace('Current SCN ', currentScn);

        return currentScn;
    },

    // Get the last recorded SCN for a monitored table
    getTableLastSCN: async (tableOwner, tableName) => {
        try {
            let tableRegistered = false;
            const SQLText = `
      SELECT MAX(start_time) max_start_time, MAX(end_time) max_end_time,
             MAX(start_scn) max_start_scn,MAX(end_scn) max_end_scn,
             COUNT(*) count
        FROM proofablecontrol
       WHERE owner_name=:1 and table_name=:2 and trietype='Monitor'
  `;
            const result = await oraConnection.execute(SQLText, [tableOwner, tableName]);
            const row = result.rows[0];
            if (row[4] > 0) {
                tableRegistered = true;
            }
            return {
                maxStartTime: row[0],
                maxEndTime: row[1],
                maxStartScn: row[2],
                maxEndScn: row[3],
                tableRegistered,
            };
        } catch (error) {
            log.error(error.stack);
        }
    },
    getLatestRowidKey: async (rowid) => {
        const result = await oraConnection.execute(
            `SELECT rowid_scn,versions_starttime
                FROM proofablecontrolrowids
                WHERE rowid_scn LIKE :1
                    OR rowid_scn = :2
                ORDER BY versions_starttime DESC
                FETCH FIRST 1 ROWS ONLY`,
            [rowid + '.%', rowid],
        );
        const highestRowidKey = result.rows[0][0];
        log.trace('Highest Rowid Key = ', highestRowidKey);
        return highestRowidKey;
    },
    // TODO: Examples should include a FBDA managed table
    // Get trie for a specific rowidStarttime key
    getTrieForRowid: async (rowidScn) => {
        const result = await oraConnection.execute(
            `
                SELECT trieid,
                        owner_name,
                        table_name
                FROM proofablecontrolrowids
                JOIN proofablecontrol USING ( trieid )
                WHERE rowid_scn = :1
                ORDER BY versions_starttime DESC
                FETCH FIRST 1 ROWS ONLY
            `,
            [rowidScn],
        );
        if (result.rows.length === 0) {
            throw new Error('No such rowid.startTime - check proofableControlsRowids table');
        }

        const trieId = result.rows[0][0];
        const tableOwner = result.rows[0][1];
        const tableName = result.rows[0][2];
        log.trace(`identifier ${rowidScn} is found in trie ${trieId}`);
        const trie = await module.exports.getTrieFromDB(trieId);
        return {
            trie,
            tableOwner,
            tableName,
        };
    },
    getTrieFromDB: async (trieId, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        log.trace(`Getting ${trieId} from DB`);

        const options = {
            fetchInfo: {
                TRIE: {
                    type: oracledb.STRING,
                },
            },
        };
        try {
            const data = await oraConnection.execute(
                `
                SELECT trie, owner_name, table_name,
                        start_time, end_time
                    FROM proofablecontrol
                WHERE trieid = :1
    `,
                [trieId],
                options,
            );
            if (data.rows.length === 0) {
                log.error('Internal error retrieving trie ', trieId);
            }

            const trieDataOut = data.rows[0][0];
            const tableOwner = data.rows[0][1];
            const tableName = data.rows[0][2];
            const startTime = data.rows[0][3];
            const endTime = data.rows[0][4];
            log.trace('Retrieved Trie ', trieId, ' for ', tableOwner, '.', tableName);
            log.trace(' Data range ', startTime, ' to ', endTime);
            const trie = await parseTrie(trieDataOut);
            return trie;
        } catch (error) {
            log.error(error.message, ' while retrieving trie from db');
        }
    },
    // Validate a rowid/timstamp key
    validateRow: async (rowidKey, outputFile, verbose = false, silent = false) => {
        // Output files
        try {
            const tmpDir = tmp.dirSync().name;
            let fileRowidKey = rowidKey;
            if (rowidKey.match('/')) {
                log.warn(`RowID ${rowidKey} contains forward slash "/" `);
                fileRowidKey = rowidKey.replace(/\//g, '-');
                log.warn('RowId will be represented in files as ', fileRowidKey);
            }
            const proofFile = `${tmpDir}/${fileRowidKey}.proof`;
            const dotFile = `${tmpDir}/${fileRowidKey}.dot`;
            const jsonFile = `${tmpDir}/${fileRowidKey}.json`;
            log.trace('temp dir and files ', tmpDir, ' ', proofFile, ' ', dotFile, ' ', jsonFile);

            let dataRowidKey;
            let trieRowIdKey;

            const splitRowId = rowidKey.split('.');
            if (splitRowId.length === 1) {
                // This key doesn't have an SCN attached.  So we will compare the
                // most recent rowid Key with the data associated with the current SCN
                const currentScn = await module.exports.getSCN();
                dataRowidKey = rowidKey + '.' + currentScn;
                trieRowIdKey = await module.exports.getLatestRowidKey(rowidKey); // Get most recent rowidkey
            } else {
                dataRowidKey = rowidKey;
                trieRowIdKey = rowidKey;
            }

            log.trace('Data Rowid Key ', dataRowidKey);
            log.trace('Trie Rowid Key ', trieRowIdKey);

            // Retrive the trie and proof for this key
            const {
                trie,
                tableOwner,
                tableName
            } = await module.exports.getTrieForRowid(trieRowIdKey);
            const proofableClient = await getProofableClient();
            const proofId = (await proofableClient.getTrieProof(trie.getId())).getId();

            // Get the current state of data
            const rowData = await module.exports.getRowData(tableOwner, tableName, dataRowidKey, verbose);

            log.trace('key/value for rowProof ', rowData);
            // Change rowData key to match trie key
            // (eg, make the rowid.scn number the same as is in the trie)
            rowData.key = trieRowIdKey;

            // generate a rowProof based on the trie and current data

            const rowProof = await generateRowProof(rowData, trie, proofId, proofFile, dotFile, verbose);
            if (rowProof.keyValues.total === rowProof.keyValues.passed && rowProof.keyValues.passed === 1) {
                if ((!silent) || verbose) log.info('Rowid validation passed ', rowProof.keyValues);
            } else {
                log.error('Rowid Validate FAILED! ', rowProof.keyValues);
            }
            const jsonData = JSON.stringify({
                rowData,
                rowProof
            });
            await fs.writeFileSync(jsonFile, jsonData);
            const zipFile = new AdmZip();
            zipFile.addLocalFolder(tmpDir);
            await zipFile.writeZip(outputFile);
            if ((!silent) || verbose) log.info(`Wrote proof for ${rowidKey} to ${outputFile}`);
            return rowProof;
        } catch (error) {
            log.error(error.message, ' while validating rowId ', rowidKey);
        }
    },
    // TODO: Use --unhandled-rejections=strict
    // TODO: Optimize - dont' get trie every time from db.  Optionally don't validate
    // TODO: Ask Guan for a server side function to produce proof file.
    createProofFile: async (trieId, outputFile, includeRowIds = false, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            log.info(`Writing proof for ${trieId} to ${outputFile}`);

            // const trie = module.exports.getTrieFromDB(trieId, verbose);

            const proofableClient = await getProofableClient();

            const tmpDir2 = tmp.dirSync().name;
            const trieProof = `${tmpDir2}/${trieId}.provendb`;
            await proofableClient.exportTrie(trieId, trieProof);

            log.trace('Writing to ', outputFile);
            const zipFile = new AdmZip();
            await zipFile.addLocalFile(trieProof);

            if (includeRowIds) {
                const rowProofTmpDir = tmp.dirSync().name;
                await module.exports.genRowProofs(trieId, rowProofTmpDir, verbose);
                await zipFile.addLocalFolder(rowProofTmpDir, 'rowProofs');
            }

            await zipFile.writeZip(outputFile);
            log.info(`Wrote proof file to ${outputFile}`)
            // TODO: Add a README to the zip
        } catch (error) {
            log.error(error.message, ' while retrieving rowids for proof');
            throw (error);
        }
    },
    genRowProofs: async (trieId, tmpDir, verbose) => {
        // TODO: Use cursors everywhere
        const results = await oraConnection.execute(
            'SELECT rowid_scn FROM proofablecontrolrowids WHERE trieid=:1',
            [trieId], {
                resultSet: true
            }
        );
        const rowBatch = 100;
        let rows = await results.resultSet.getRows(rowBatch);
        while (rows.length) {
            log.trace('batch', rows.length);
            for (let ri = 0; ri < rows.length; ri++) {
                const row = rows[ri];
                const rowIdScn = row[0];
                let outFile = `${tmpDir}/${rowIdScn}.provendb`;
                if (rowIdScn.match('/')) {
                    log.warn(`RowID ${rowIdScn} contains forward slash "/" `);
                    const fileRowidKey = rowIdScn.replace(/\//g, '-');
                    log.warn('RowId will be represented in files as ', fileRowidKey);
                    outFile = `${tmpDir}/${fileRowidKey}.provendb`;
                }
                try {
                    await module.exports.validateRow(rowIdScn, outFile, verbose, true);
                    process.stdout.write('.');
                } catch (error) {
                    log.error(error.message, ` while retrieving rowid ${rowIdScn} for proof`);
                    console.log(error);
                    throw (error);
                }
            }
            rows = await results.resultSet.getRows(rowBatch);
        }
        await results.resultSet.close();
        console.log();
    },
    validateProof: async (proofId, outputFile, verbose) => {
        // Get proof data from db;
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            log.info('Retrieving proof details for ', proofId);
            const {
                tableDef,
                trietype,
                where
            } = await module.exports.getProofDetails(proofId, verbose);
            if (tableDef.exists) {
                // Get trie as well
                log.info('Getting Proof');
                const trie = await module.exports.getTrieFromDB(proofId);
                // Get data corresponding to trie
                if (trietype === 'AdHoc') {
                    log.info('Loading table data');
                    const tableData = await module.exports.process1TableChanges(tableDef, 'adhoc', where, false);
                    log.info('Validating table data against proof');
                    const validatedProof = await validateData(trie, tableData.keyValues, outputFile, verbose);
                    console.log(validatedProof);
                } else {
                    log.error(`Cannot validate ${trietype} proof yet`);
                }
            } else {
                log.error('Table refered to in proof no longer exists');
            }
            // Validate
        } catch (error) {
            log.error(error.message);
            throw (error);
        }
    },
    getProofDetails: async (proofId, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const result = await oraConnection.execute(
            `SELECT owner_name,
                                table_name,
                                start_time,
                                end_time,
                                start_scn,
                                end_scn,
                                trietype,
                                whereclause
                        FROM proofablecontrol where trieid=:1
                `, [proofId]
        );
        if (result.rows.length === 0) {
            throw new Error(`No entry for Proof ${proofId}`);
        }
        log.trace(result);
        const row = result.rows[0];
        const userName = row[0];
        const tableName = row[1];
        const trietype = row[6];
        const where = row[7];
        const tableDef = await module.exports.check1table(userName, tableName);
        log.trace(tableDef);
        return {
            tableDef,
            trietype,
            where
        };
    }
};