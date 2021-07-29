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

const debug = false;

const {
    sprintf
} = require('sprintf-js');
const {
    anchorData,
    validateBlockchainHash,
    validateProof,
    parseProof,
    generateRowProof,
    validateData,
    genProofCertificate
} = require('./proofable');

oracledb.autoCommit = false;
let oraConnection = {};
const tableDefs = [];
// TODO: Need to get rid of the tableDefs global.
let monitorStartTime;


// TODO: Make sure that the data in the proof file can be re-validated
// TODO: Don't include data in the proof unless on request.

module.exports = {
    connectToOracleDirect: async (connectString, user, password, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            log.trace(`Connecting to ${connectString} ${user} ${password}`);
            oraConnection = await oracledb.getConnection({
                connectString,
                user,
                password,
            });
            oracledb.fetchAsString = [oracledb.CLOB];
            log.trace('Connected to Oracle');
            log.info('SQL TRACE is ', process.env.SQL_TRACE);
            if (verbose || ('SQL_TRACE' in process.env && process.env.SQL_TRACE === 'TRUE')) {
                await module.exports.execSQL(oraConnection, 'begin dbms_session.session_trace_enable(waits=>TRUE);end;', false, verbose);
                await module.exports.execSQL(oraConnection, 'ALTER SESSION SET tracefile_identifier=provendb', false, verbose);
                const sqlt = `SELECT s.sql_trace, p.tracefile 
                                FROM v$session s JOIN v$process p ON (p.addr= s.paddr) 
                               WHERE audsid = USERENV ('SESSIONID')`;
                const result = await oraConnection.execute(sqlt);
                log.trace(result);
                const enabled = result.rows[0][0];
                const location = result.rows[0][1];
                log.info(`SQL trace ${enabled} at ${location}`);
            }
            return oraConnection;
        } catch (error) {
            log.error(error.message, ' while connecting to oracle');
            throw (error);
        }
    },
    // Connect to Oracle from config file
    connectToOracle: async (config, verbose = false) => {
        log.trace('Connecting to Oracle...');
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            oraConnection = await module.exports.connectToOracleDirect(
                config.oracleConnection.connectString,
                config.oracleConnection.user,
                config.oracleConnection.password,
                verbose
            );
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
            log.trace(`SYS password ${password}`);
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
            if (createDemoAccount) {
                await module.exports.createDemoTables(connectString, provendbUser, provendbPassword, verbose);
            }
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
        log.trace(`Connecting to ${provendbUser} user `, connectString, ' ', provendbPassword);
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

            sqls.push(
                `CREATE TABLE provendbcontrol (
                    owner_name   VARCHAR2(128) NOT NULL,
                    table_name   VARCHAR2(128) NOT NULL,
                    start_time   DATE NOT NULL,
                    end_time     DATE NOT NULL,
                    start_scn    NUMBER,
                    end_scn      NUMBER,
                    proofid       VARCHAR2(256),
                    proof         CLOB NOT NULL CHECK (proof IS JSON),
                    proofType     VARCHAR2(30) NOT NULL,
                    whereclause VARCHAR2(2000),
                    metadata     VARCHAR2(4000) CHECK (metadata IS JSON),
                    CONSTRAINT table1_pk PRIMARY KEY ( proofid )
                        USING INDEX (
                            CREATE UNIQUE INDEX table1_pk ON
                                provendbcontrol (
                                    proofid
                                ASC )
                        )
                    ENABLE)`
            );

            sqls.push(
                `CREATE INDEX provendbcontrol_i1 ON
                          provendbcontrol (
                              owner_name,
                              table_name,
                              start_time,
                              end_time)`
            );
            sqls.push(
                `CREATE TABLE provendbcontrolrowids (
                            proofid            VARCHAR2(256) NOT NULL,
                            rowid_scn   VARCHAR2(128) NOT NULL,
                            versions_starttime timestamp not null,
                            CONSTRAINT provendbcontrolrowids_pk 
                            PRIMARY KEY ( proofid,rowid_scn ) ENABLE)`
            );
            sqls.push(
                `ALTER TABLE provendbcontrolrowids
                          ADD CONSTRAINT provendbcontrolrowids_fk1 FOREIGN KEY ( proofid )
                              REFERENCES provendbcontrol ( proofid )
                          ENABLE`
            );
            sqls.push(
                `CREATE INDEX provendbcontrolrowids_i1 
                    ON provendbcontrolrowids(rowid_scn)`
            );
            sqls.push(
                'CREATE SEQUENCE provendbSequence'
            );
            sqls.push(
                `CREATE TABLE provendbRequests (
                    id NUMBER   DEFAULT provendbSequence.nextval,
                    requestType VARCHAR2(12) DEFAULT('ANCHOR'),
                    requestJSON VARCHAR2(4000) ,
                    status      VARCHAR2(12) DEFAULT('NEW'),
                    statusDate  DATE DEFAULT(SYSDATE),
                    messages    VARCHAR(4000),
                    CONSTRAINT  "requestIsJSON" CHECK (requestJSON IS JSON),
                    CONSTRAINT  provendbRequests_pk PRIMARY KEY (id))`
            );
            sqls.push(
                'CREATE INDEX provendbRequests_i1 ON provendbRequests(status,statusDate)'
            );
            sqls.push(
                `CREATE OR REPLACE TRIGGER provendbRequests_trg 
                    AFTER INSERT  ON provendbRequests
                    BEGIN 
                        DBMS_ALERT.SIGNAL('provendb_alert','provendbrequests table modified'); 
                    END; `
            );
            sqls.push(
                `CREATE OR REPLACE FUNCTION anchorRequest(l_requestJSON provendbRequests.requestJSON%type)
                        RETURN provendbRequests.id%TYPE IS 
                        l_id provendbRequests.id%TYPE;
                    BEGIN
                        INSERT INTO provendbRequests(requestJSON) 
                            VALUES(l_requestJSON)
                            returning id INTO l_id;
                        COMMIT;
                        RETURN(l_id);
                    END;`
            );

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
        log.trace('Connecting to provendbDemo user ', connectString, ' ', provendbPassword);
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
            let sqls = [];
            sqls.push(
                ` CREATE TABLE contractsTable(
                      contractId   NUMBER PRIMARY KEY,
                      metaData     VARCHAR2(4000)
                        CHECK (metaData IS JSON),
                      contractData CLOB NOT NULL,
                      mytimestamp TIMESTAMP
                    )`
            );

            sqls.push(
                ` CREATE TABLE contractsTableFBDA(
                              contractId   NUMBER PRIMARY KEY,
                              metaData     VARCHAR2(4000)
                                CHECK (metaData IS JSON),
                              contractData VARCHAR2(4000) NOT NULL,
                              mytimestamp TIMESTAMP
                            )`
            );
            sqls.push(
                'CREATE SEQUENCE contract_seq '
            );
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
                  END; `
            );
            sqls.push(
                `BEGIN
                    populatecontractsTable(100);
                    COMMIT;
                 END;`
            );
            sqls.push('INSERT INTO contractsTableFBDA SELECT * FROM contractsTable');
            sqls.push('commit');
            sqls.push('GRANT ALL ON contractsTableFBDA TO PUBLIC');
            sqls.push('GRANT ALL ON contractsTable TO PUBLIC');
            for (let s = 0; s < sqls.length; s++) {
                await module.exports.execSQL(oraConnection, sqls[s], false, verbose);
            }
            // These can fail.
            sqls = [];
            sqls.push(
                `CREATE OR REPLACE TRIGGER contractsTable_prrovendb_trg 
                    AFTER INSERT OR UPDATE OR DELETE ON contractsTable
                    BEGIN 
                      DBMS_ALERT.SIGNAL('provendb_alert','provendb table modified'); 
                    END; `
            );
            sqls.push(
                `CREATE OR REPLACE TRIGGER contractsTableFB_prrovendb_trg 
                    AFTER INSERT OR UPDATE OR DELETE ON contractstablefbda
                    BEGIN 
                        DBMS_ALERT.SIGNAL('provendb_alert','provendb table modified'); 
                    END; `
            );
            sqls.push(`CREATE flashback archive ${provendbDemoUser} tablespace ${defaultTablespace} retention 1 month`);
            sqls.push(`ALTER table contractsTableFBDA flashback archive ${provendbDemoUser}`);
            for (let s = 0; s < sqls.length; s++) {
                await module.exports.execSQL(oraConnection, sqls[s], true, verbose);
            }
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
            // SQLs that cannot fail
            let sqls = [`CREATE USER ${provendbUser}  IDENTIFIED BY ` + provendbPassword,
                `GRANT CONNECT, RESOURCE, CREATE SESSION, SELECT_CATALOG_ROLE , UNLIMITED TABLESPACE, CREATE VIEW TO ${provendbUser} `,
            ];

            for (let s = 0; s < sqls.length; s++) {
                await module.exports.execSQL(sysConnection, sqls[s], false, verbose);
            }
            // SQLs that might fail
            sqls = [`GRANT SELECT ANY TABLE TO ${provendbUser} `,
                `GRANT ALTER SESSION to ${provendbUser} `,
                `GRANT FLASHBACK ANY TABLE  TO ${provendbUser} `,
                `GRANT execute_catalog_role TO ${provendbUser} `,
                `GRANT execute ON dbms_alert  TO ${provendbUser} `,
                `GRANT execute ON dbms_Session to ${provendbUser} `
            ];
            for (let s = 0; s < sqls.length; s++) {
                await module.exports.execSQL(sysConnection, sqls[s], true, verbose);
            }
            if (createDemoAccount) {
                log.info(`Creating ${provendbDemoUser}  account`);
                // Must succeed
                let sqls = [`CREATE USER ${provendbDemoUser} IDENTIFIED BY ` + provendbPassword,
                    `GRANT CONNECT, RESOURCE, CREATE SESSION, SELECT_CATALOG_ROLE , UNLIMITED TABLESPACE, CREATE VIEW TO ${provendbDemoUser}`
                ];
                for (let s = 0; s < sqls.length; s++) {
                    await module.exports.execSQL(sysConnection, sqls[s], false, verbose);
                }
                // These can fail
                sqls = [
                    `GRANT execute_catalog_role TO ${provendbDemoUser}`,
                    `GRANT execute ON dbms_alert TO ${provendbDemoUser}`, `GRANT FLASHBACK ARCHIVE ADMINISTER TO ${provendbDemoUser}`
                ];
                for (let s = 0; s < sqls.length; s++) {
                    await module.exports.execSQL(sysConnection, sqls[s], true, verbose);
                }
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
        let theRowId;
        let scn;
        let result;
        let useScn = false;

        log.trace('Getting data for ', rowidKey);
        const rowidScn = rowidKey.split('.');


        if (rowidScn.length > 1) {
            scn = rowidScn[1];
            theRowId = rowidScn[0];
            useScn = true;
        } else {
            theRowId = rowidKey;
        }

        const tableOwnerName = `${tableOwner}.${tableName}`;
        if (useScn) {
            result = await getRowDataWithScn(tableOwnerName, scn, theRowId, verbose);
        } else {
            result = await getRowDataNoScn(tableOwnerName, theRowId, verbose);
        }
        assert(result.rows.length === 1, 'Only one row returned for rowid_scn');
        const row = result.rows[0];
        const jsonRow = module.exports.ora2json(result);
        log.trace(jsonRow);

        const key = rowidKey;
        log.trace('Data to be hashed ', row);
        // TODO: Make sure that the row in the proof file is stringified in the same way
        const hash = crypto.createHash('sha256').update(stringify(row)).digest('base64');
        log.trace('hash ', hash);
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
            let rowNo = 0;
            result.rows.forEach((row) => {
                rowNo += 1;
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
                if (rowNo === 1) {
                    log.trace('data to be hashed:', data);
                    log.trace('key: ', key, ' hash:', hash);
                }
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

            tableDefs[table] = await module.exports.getTableDef(splitTable[0], splitTable[1]);
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
    getTableDef: async (user, table) => {
        log.trace('Checking ', user, '.', table);
        const tableData = {};
        tableData.tableOwner = user;
        tableData.tableName = table;
        if (await module.exports.tableExists(user, table)) {
            const fbdaData = await module.exports.getFBDAdetails(user, table);
            const MaxEndTimeResult = await oraConnection.execute(
                `SELECT MAX(end_time) MAXENDTIME from provendbcontrol
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
            log.trace('Flashback Archive last Purge Time ', lastPurgeTime);
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
    getTableDataNoScn: async (tableName, where, columnList = '*') => {
        let result;
        let whereClause = '';

        if (where) {
            whereClause = 'WHERE ' + where;
        }
        if (columnList === '*') {
            columnList = 'C.*';
        }

        const sqlText = `
        SELECT rowidtochar(C.ROWID) as row_rowid,${columnList}  
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
        let whereClause = '';

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
            log.trace(result.rows.length, ' rows reprooved');
        } catch (error) {
            log.error(error.message);
            if (error.errorNum === 30052) {
                // We don't have flashback data since the last monitored sample
                log.error('Insufficient flashback history to capture all changes since last sample');
                log.info('Attempting to reproove current state');
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
    listEntries: async (rowid, header = true) => {
        try {
            const format = '%-18s %-50s\n\t %-26s %-24s %-24s';
            if (header) {
                console.log('\n');
                console.log(sprintf(format, 'Rowid', 'Proof', 'key', 'startDate', 'endDate'));
            }
            const rowidPattern = `${rowid}.%`;
            const sqlText = `
                SELECT rowid_scn,proofid,start_time,end_time 
                FROM provendbcontrolrowids 
                JOIN provendbcontrol USING(proofid)
                WHERE rowid_scn LIKE :1 or rowid_scn=:2
                ORDER BY start_time 
  `;
            const result = await oraConnection.execute(sqlText, [rowidPattern, rowid]);
            const shortProofs = {};
            if (result.rows.length === 0) {
                log.error(`No proofs for ${rowid}`);
            } else {
                result.rows.forEach((row) => {
                    const key = row[0];
                    const proofId = row[1];
                    const shortProofId = module.exports.shortProofId(proofId);
                    shortProofs[proofId] = shortProofId;
                    const startDate = row[2];
                    const endDate = row[3];
                    console.log(sprintf(format, rowid, proofId, key, startDate.toISOString(), endDate.toISOString()));
                });
            }
        } catch (error) {
            log.error(error.stack);
        }
    },
    listProofs: async (tables) => {
        try {
            const format = 'Proof: %-90s %-10s\n\t %-40s %-24s %-20s';
            console.log('\n');
            console.log(sprintf(format, 'Proof', 'Type', 'Table', 'Where', 'proofDate'));

            const sqlText = `
            SELECT PROOFID, OWNER_NAME||'.'||TABLE_NAME table_name, start_time,  PROOFTYPE, WHERECLAUSE 
              FROM PROVENDBCONTROL p`;
            const result = await oraConnection.execute(sqlText);

            if (result.rows.length === 0) {
                log.error('No proofs found');
            } else {
                result.rows.forEach((row) => {
                    const proofId = row[0];
                    const table = row[1];
                    const proofDate = row[2];
                    const proofType = row[3];
                    const whereClause = row[4];
                    console.log(sprintf(format, proofId, proofType, table, whereClause, proofDate.toISOString()));
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
            const tableData = await module.exports.getTableData(tableDef, false, null, true, null);
            if (Object.keys(tableData.keyValues).length > 0) {
                const treeWithProof = await anchorData(tableData, config.anchorType, config.proofable.token, false);

                await module.exports.saveproofToDB(
                    treeWithProof,
                    tableDef.tableOwner,
                    tableDef.tableName,
                    tableData,
                    'Monitor',
                    null,
                    true
                );
            } else {
                log.info('No new data to anchor');
            }
        }
    },
    // Process requests in the provendbRequests table
    processRequests: async (verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        while (true) {
            const querySQL = `SELECT id,requesttype,requestjson FROM provendbrequests 
                         WHERE ID =(SELECT MIN(ID)
                                        FROM PROVENDBREQUESTS
                                        WHERE STATUS = 'NEW')
                            FOR UPDATE WAIT 120`;
            log.trace(querySQL);
            const request = await oraConnection.execute(querySQL);
            log.trace(request);
            if (request.rows.length === 0) {
                oraConnection.commit;
                break;
            } else {
                log.trace(request);
                log.info('Processing request ');
                const id = request.rows[0][0];
                const requestType = request.rows[0][1];
                const requestJson = JSON.parse(request.rows[0][2]);
                log.trace(id, requestType, requestJson);
                if (requestType === 'ANCHOR') {
                    await processAnchorRequest(id, requestJson, verbose);
                }
                oraConnection.commit;
                break;
            }
        }
    },
    // Save a proof to the Proofable control table
    saveproofToDB: async (treeWithProof, tableOwner, tableName, tableData, proofType, whereclause, includeScn, columnList = '*') => {
        try {
            if (debug) {
                console.log(JSON.stringify(treeWithProof));
            }

            const proofId = treeWithProof.proofs[0].id;
            log.info(`Saving proof ${proofId} to db`);


            // Create an array of bind variables for array insert

            const metadata = {
                tableOwner,
                tableName,
                proofType,
                whereclause,
                currentScn: tableData.currentScn,
                includeScn,
                columnList
            };
            const insOut = await oraConnection.execute(
                `INSERT INTO provendbcontrol 
                        (proofId, proof, owner_name, table_name, 
                         start_time, end_time ,start_scn, end_scn,proofType,whereclause,metadata) 
                  VALUES(:1, :2, :3, :4, :5 , :6, :7, :8,:9,:10,:11)`,
                [
                    proofId,
                    JSON.stringify(treeWithProof),
                    tableOwner,
                    tableName,
                    new Date(tableData.minStartTime),
                    new Date(tableData.maxStartTime),
                    tableData.minStartScn,
                    tableData.maxStartScn,
                    proofType,
                    whereclause,
                    JSON.stringify(metadata)
                ],
            );
            log.info(`${insOut.rowsAffected} rows inserted into provendbcontrol`);

            let rowIdBindData = [];
            let totalRows = 0;
            // Object.keys(tableData.keyValues).forEach((key) => {
            const keys = Object.keys(tableData.keyValues);
            for (let ki = 0; ki < keys.length; ki += 1) {
                const key = keys[ki];
                // const timePart = new Date(Number(key.split('.')[1]));
                rowIdBindData.push([proofId, key, new Date(tableData.keyTimeStamps[key])]);
                if (ki % 10000 === 9999) {
                    const ins2Out = await oraConnection.executeMany(
                        `INSERT INTO provendbcontrolrowids 
                         (proofId, rowid_scn, versions_starttime ) 
                          VALUES(:1, :2, :3 )`,
                        rowIdBindData,
                    );
                    process.stdout.write('.');
                    totalRows += ins2Out.rowsAffected;
                    rowIdBindData = [];
                }
            }

            const ins2Out = await oraConnection.executeMany(
                `INSERT INTO provendbcontrolrowids 
                 (proofId, rowid_scn, versions_starttime ) 
                  VALUES(:1, :2, :3 )`,
                rowIdBindData,
            );
            totalRows += ins2Out.rowsAffected;
            process.stdout.write('\n');
            log.info(`${totalRows} rows inserted into provendbcontrolrowids`);
            await oraConnection.commit();
        } catch (error) {
            log.error(error.message);
            throw (error);
        }
    },

    // Process changes for a single table
    getTableData: async (tableDef, adHoc, where, includeScn, scnValue, columnList = '*', keyColumns = 'ROWID', verbose = false) => {
        const debug = false;
        if (verbose || debug) {
            log.setLevel('trace');
        }
        log.info('Processing ', ' ', tableDef.tableOwner, '.', tableDef.tableName);
        log.trace(' Where: ', where);
        log.trace('IncludeSCN:', includeScn);
        log.trace('ColumnList:', columnList);
        log.trace('keyColumns:', keyColumns);

        const tableName = `${tableDef.tableOwner}.${tableDef.tableName}`;

        // Use the current SCN unless one has been passed.
        let effectiveScn;
        if (scnValue) {
            effectiveScn = scnValue;
        } else {
            effectiveScn = await module.exports.getSCN();
        }
        log.trace('Effective SCN ', effectiveScn);
        const lastProofableAnchor = await module.exports.getTableLastSCN(
            tableDef.tableOwner,
            tableDef.tableName,
        );
        log.trace(lastProofableAnchor);

        let rawTableData;
        if (adHoc && !includeScn) {
            // We always get SCN values unless an adhoc request has been made without
            // SCNs
            rawTableData = await module.exports.getTableDataNoScn(tableName, where, columnList);
        } else {
            rawTableData = await module.exports.getTableDataScn(
                tableName,
                lastProofableAnchor,
                effectiveScn,
                adHoc,
                where
            );
        }
        // log.trace(rawTableData);
        const processedTableData = module.exports.processTableData(rawTableData, effectiveScn, includeScn);
        // log.trace(processedTableData);

        return {
            keyValues: processedTableData.keyValues,
            keyTimeStamps: processedTableData.keyTimeStamps,
            maxStartTime: processedTableData.maxStartTime,
            minStartTime: processedTableData.minStartTime,
            maxStartScn: processedTableData.maxStartScn,
            minStartScn: processedTableData.minStartScn,
            currentScn: effectiveScn
        };
    },

    listTableEntries: async (tables, where) => {
        for (let ti = 0; ti < tables.length; ti++) {
            const tableName = tables[ti];

            let sqlText = `Select rowid from ${tableName}`;
            if (where) {
                sqlText += ` WHERE ${where}`;
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
            const format = '%-18s %-60s\n\t %-26s %-24s %-24s';
            console.log(sprintf(format, 'Rowid', 'Proof', 'key', 'startDate', 'endDate'));
            let row = await results.resultSet.getRow();
            while (row) {
                const rowId = row[0];
                await module.exports.listEntries(rowId, false);
                row = await results.resultSet.getRow();
            }
            await results.resultSet.close();
        }
    },
    shortProofId: (proofId) => {
        return (proofId.substr(1, 8) + '....' + proofId.substr(proofId.length - 8));
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
        FROM provendbcontrol
       WHERE owner_name=:1 and table_name=:2 and prooftype='Monitor'
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
                FROM provendbcontrolrowids
                WHERE rowid_scn LIKE :1 OR  rowid_scn = :2
                ORDER BY versions_starttime DESC
                FETCH FIRST 1 ROWS ONLY`,
            [rowid + '.%', rowid],
        );
        if (result.rows.length === 0) {
            log.error('Cannot find proof for rowid ', rowid);
            throw Error('No such rowid');
        }
        const highestRowidKey = result.rows[0][0];
        log.trace('Highest Rowid Key = ', highestRowidKey);
        return highestRowidKey;
    },

    // Get proof for a specific rowidStarttime key
    getproofForRowid: async (rowidScn, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const result = await oraConnection.execute(
            `
                SELECT proofid,
                        owner_name,
                        table_name
                FROM provendbcontrolrowids
                JOIN provendbcontrol USING ( proofid )
                WHERE rowid_scn = :1
                ORDER BY versions_starttime DESC
                FETCH FIRST 1 ROWS ONLY
            `,
            [rowidScn],
        );
        log.trace(result);
        if (result.rows.length === 0) {
            throw new Error('No such rowid.startTime - check provendbcontrolsRowids table');
        }

        const proofId = result.rows[0][0];
        const tableOwner = result.rows[0][1];
        const tableName = result.rows[0][2];
        log.trace(`identifier ${rowidScn} is found in proof ${proofId}`);
        const proof = await module.exports.getproofFromDB(proofId, verbose);
        return {
            proof,
            tableOwner,
            tableName,
        };
    },
    getproofFromDB: async (proofId, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        log.trace(`Getting ${proofId} from DB`);

        const options = {
            fetchInfo: {
                proof: {
                    type: oracledb.STRING,
                },
            },
        };
        try {

            const data = await oraConnection.execute(
                `
                SELECT proof, owner_name, table_name,
                        start_time, end_time
                    FROM provendbcontrol
                WHERE proofid = :1
    `,
                [proofId],
                options,
            );

            if (data.rows.length === 0) {
                log.error('Internal error validating proof ', proofId);
            }

            const textProof = data.rows[0][0];
            const proof = parseProof(textProof);
            const tableOwner = data.rows[0][1];
            const tableName = data.rows[0][2];
            const startTime = data.rows[0][3];
            const endTime = data.rows[0][4];
            log.trace('Retrieved proof ', proofId, ' for ', tableOwner, '.', tableName);
            log.trace(' Data range ', startTime, ' to ', endTime);
            log.trace(typeof proof);
            log.trace('proof', proof);
            return proof;
        } catch (error) {
            log.error(error.message, ' while retrieving proof from db');
        }
    },
    // Validate a rowid/timstamp key
    validateRow: async (rowidKey, outputFile, generateCertificate = false, config, verbose = false, silent = false) => {
        // Output files
        try {
            if (verbose) {
                log.setLevel('trace');
            }
            const tmpDir = tmp.dirSync().name;
            let fileRowidKey = rowidKey;
            const rowId = rowidKey;
            if (rowidKey.match('/')) {
                log.warn(`RowID ${rowidKey} contains forward slash "/" `);
                fileRowidKey = rowidKey.replace(/\//g, '-');
                log.warn('RowId will be represented in files as ', fileRowidKey);
            }
            const proofFile = `${tmpDir}/${fileRowidKey}.proof`;
            const jsonFile = `${tmpDir}/${fileRowidKey}.json`;
            const certificateFile = `${tmpDir}/${fileRowidKey}.pdf`;
            log.trace('temp dir and files ', tmpDir, ' ', proofFile, ' ', certificateFile, ' ', jsonFile);

            let rowidSCNKey;
            let proofRowIdKey;

            const splitRowId = rowidKey.split('.');

            if (splitRowId.length === 1) {
                // This key doesn't have an SCN attached.  So we will compare the
                // most recent rowid Key with the data associated with the current SCN
                const currentScn = await module.exports.getSCN();
                rowidSCNKey = rowidKey + '.' + currentScn;
                proofRowIdKey = await module.exports.getLatestRowidKey(rowidKey); // Get most recent rowidkey
            } else {
                rowidSCNKey = rowidKey;
                proofRowIdKey = rowidKey;
                rowid = splitRowId[0];
            }
            log.trace('Data Rowid Key ', rowidSCNKey);
            log.trace('proof Rowid Key ', proofRowIdKey);
            // Retrive the proof  for this key
            const {
                proof,
                tableOwner,
                tableName
            } = await module.exports.getproofForRowid(proofRowIdKey, verbose);
            log.trace('proof ', proof);
            // Get the current state of data
            const rowData = await module.exports.getRowData(tableOwner, tableName, proofRowIdKey, verbose);
            log.trace('key/value for rowProof ', rowData);
            const proofHash = crypto.createHash('sha256').update(rowData.hash).digest('hex');
            // TODO: this two level hashing process might be confusing
            const treeLeafValue = proofRowIdKey + ':' + proofHash;
            log.trace('proof ', proof);

            if (!proof.layers[0].includes(treeLeafValue)) {
                log.error(`FAIL: Hash mismatch for ${rowId} - rowid key ${treeLeafValue} not found`);
                return (false);
            }
            log.info(`PASS: Rowid hash value confirmed as ${treeLeafValue}`);
            const rowProof = await generateRowProof(proof, proofRowIdKey, verbose);
            log.trace(rowProof);
            const validatedProof = await validateProof(rowProof, verbose);
            log.trace('validatedProof ', validatedProof);
            log.trace('Expected value for blockchain transaction is ', validatedProof.expectedValue);
            if (await validateBlockchainHash(rowProof.anchorType, rowProof.metadata.txnId, validatedProof.expectedValue, verbose)) {
                log.info('PASS: Proof validated with hash ', validatedProof.expectedValue, ' on ', rowProof.metadata.txnUri);
            } else {
                log.error('FAIL: Cannot validate blockchain hash');
            }
            // Change rowData key to match proof key
            // (eg, make the rowid.scn number the same as is in the proof)
            rowData.key = proofRowIdKey;
            const jsonData = {
                rowData,
                rowProof
            };
            const jsonString = JSON.stringify(jsonData);
            if (outputFile) {
                if (generateCertificate) {
                    await genProofCertificate(jsonData, certificateFile, config.proofable.token, verbose);
                }
                await fs.writeFileSync(jsonFile, jsonString);
                const zipFile = new AdmZip();
                zipFile.addLocalFolder(tmpDir);
                await zipFile.writeZip(outputFile);
                if ((!silent) || verbose) log.info(`Wrote proof for ${rowidKey} to ${outputFile}`);
            }
            return rowProof;
        } catch (error) {
            log.error(error.message, ' while validating rowId ', rowidKey);
            throw error;
        }
    },
    // TODO: Use --unhandled-rejections=strict

    createProofFile: async (tree, outputFile, includeRowIds = false, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            const proofId = tree.proofs[0].id;
            log.info(`Writing proof for ${proofId} to ${outputFile}`);

            // const proof = module.exports.getproofFromDB(proofId, verbose);
            const tmpDir2 = tmp.dirSync().name;
            const proofFile = `${tmpDir2}/${proofId}.provendb`;
            tree.exportSync(proofFile);

            const zipFile = new AdmZip();
            await zipFile.addLocalFile(proofFile);

            if (includeRowIds) {
                const leaves = tree.getLeaves();
                const proof = tree.proofs[0];
                const rowProofTmpDir = tmp.dirSync().name;
                for (let li = 0; li < leaves.length; li += 1) {
                    const {
                        key,
                        value
                    } = leaves[li];
                    const fileKey = module.exports.safeRowId(key);
                    const rowproof = tree.addPathToProof(proof, key, 'pdb_row_branch');

                    await fs.writeFileSync(rowProofTmpDir + '/' + fileKey + '.proof', rowproof);
                }
                await zipFile.addLocalFolder(rowProofTmpDir, 'rowProofs');
            }

            await zipFile.writeZip(outputFile);
            log.info(`Wrote proof file to ${outputFile}`);
            // TODO: Add a README to the zip
        } catch (error) {
            log.error(error.message, ' while retrieving rowids for proof');
            throw (error);
        }
    },
    safeRowId: (rowId) => {
        let returnRowId = rowId;
        if (rowId.match('/')) {
            log.warn(`RowID ${rowId} contains forward slash "/" `);
            returnRowId = rowId.replace(/\//g, '-');
            log.warn('RowId will be represented in files as ', returnRowId);
        }
        return (returnRowId);
    },
    genRowProofs: async (proofId, tmpDir, verbose) => {
        // TODO: Use cursors everywhere
        const results = await oraConnection.execute(
            'SELECT rowid_scn FROM provendbcontrolrowids WHERE proofid=:1',
            [proofId], {
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
                    await module.exports.validateRow(rowIdScn, outFile, false, {}, verbose, true);
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
    validateOracleProof: async (proofId, outputFile, verbose) => {
        // Get proof data from db;
        let validatedProof;

        if (verbose) {
            log.setLevel('trace');
        }
        try {
            log.trace('Retrieving proof details for ', proofId);
            const {
                tableDef,
                prooftype,
                where,
                metadata
            } = await module.exports.getProofDetails(proofId, verbose);
            log.trace('metatdata ', metadata);

            if (tableDef.exists) {
                // Get proof as well
                log.trace('Getting Proof');
                const proof = await module.exports.getproofFromDB(proofId);
                // Get data corresponding to proof
                log.trace('Loading table data');
                const tableData = await module.exports.getTableData(tableDef, 'adhoc', where, metadata.includeScn, metadata.currentScn, metadata.columnList);
                log.trace('Validating table data against proof');
                const proofMetadata = {
                    tableOwner: tableDef.tableOwner,
                    tableName: tableDef.tableName,
                    whereClause: where,
                    includeScn: metadata.includeScn,
                    currentScn: metadata.currentScn,
                    validationDate: new Date()
                };
                const validatedData = await validateData(proof, tableData.keyValues, outputFile, proofMetadata, verbose);
                log.trace('validated data ', validatedData);
                const blockchainProof = proof.proofs[0];
                log.trace(blockchainProof);
                const validatedProof = await validateProof(blockchainProof, verbose);
                log.trace('validatedProof ', validatedProof);
                log.trace('Expected value for blockchain transaction is ', validatedProof.expectedValue);
                if (await validateBlockchainHash(blockchainProof.anchorType, blockchainProof.metadata.txnId, validatedProof.expectedValue, verbose)) {
                    log.info('PASS: Proof validated with hash ', validatedProof.expectedValue, ' on ', blockchainProof.metadata.txnUri);
                } else {
                    log.error('FAIL: Cannot validate blockchain hash');
                }
            } else {
                log.error('Table refered to in proof no longer exists');
            }
            return (validatedProof);
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
                                prooftype,
                                whereclause,
                                metadata
                        FROM provendbcontrol where proofid=:1
                `, [proofId]
        );
        if (result.rows.length === 0) {
            throw new Error(`No entry for Proof ${proofId}`);
        }
        log.trace(result);
        const row = result.rows[0];
        const userName = row[0];
        const tableName = row[1];
        const prooftype = row[6];
        const where = row[7];
        const metadata = JSON.parse(row[8]);
        const tableDef = await module.exports.getTableDef(userName, tableName);
        log.trace(tableDef);
        return {
            tableDef,
            prooftype,
            where,
            metadata
        };
    }
};

async function getRowDataWithScn(tableOwnerName, scn, therowid, verbose = false) {
    if (verbose) {
        log.setLevel('trace');
    }
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
        return (result);
    } catch (error) {
        if (error.errorNum === 8181) {
            log.error(`Cannot get data for SCN ${scn} - insufficient flashback data`);
            log.error('Consider implementing Flashback data archive or increase undo retention');
        }
        throw (error);
    }
}

async function getRowDataNoScn(tableOwnerName, therowid, verbose = false) {
    if (verbose) {
        log.setLevel('trace');
    }
    const sqlText = `
        SELECT rowidtochar(c.rowid) AS row_rowid, c.*
          FROM ${tableOwnerName}  C
         WHERE ROWID = :therowid`;

    log.trace(sqlText);
    const result = await oraConnection.execute(sqlText, {
        therowid,
    });
    return (result);
}

async function processAnchorRequest(id, requestJson, verbose) {
    if (verbose) {
        log.setLevel('trace');
    }
}