//
// Proofable SDK example
// Get some data from an Postgres database, anchor it to a blockchain
// tamper with the database and show that we can detect the tampering
/*
 * proofable
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
/* eslint no-console:off */
/* eslint no-use-before-define:off */
/* eslint no-trailing-spaces:off */
/* eslint padded-blocks:off */
/* eslint no-unused-vars:warn */
/* eslint indent:off */
/* eslint eol-last:off */
/* eslint no-await-in-loop:off */
/* eslint no-plusplus:off */
/* eslint prefer-destructuring:off */
/* eslint camelcase:warn */

// TODO: minRefresh time
// TODO: Combine proof documents into a zip file 

const commandLineUsage = require('command-line-usage');
const commandLineArgs = require('command-line-args');
const yaml = require('js-yaml');
const fs = require('fs');
const log = require('simple-node-logger').createSimpleLogger();
const oracledb = require('oracledb');
const tmp = require('tmp');
const assert = require('assert');
const crypto = require('crypto');
const stringify = require('json-stringify-safe');
const proofable = require('proofable');
const sprintf = require('sprintf-js').sprintf;

let proofableClient;
let oraConnection;
let options;

oracledb.autoCommit = false;

let config = {};
const tableDefs = {};

const main = async () => {
    log.setLevel('info');
    try {
        try {
            options = commandLineArgs(optionDefinitions);
        } catch (cmderror) {
            usage();
            process.exit(1);
        }

        if (options.verbose) {
            log.setLevel('trace');
            log.trace(config);
        }
        log.trace(options);
        if (options.help === true) {
            usage();
            process.exit(0);
        }
        if (options.config) {
            config = yaml.safeLoad(fs.readFileSync(options.config, 'utf8'));
        } else {
            console.log('No configuration file specified');
            usage();
            process.exit(1);
        }

        oraConnection = await connectToOracle(config);
        await connectToProofable();

        if (options.listRowids) {
            // List entries known for a specific RowId
            await listEntries(options.listRowids);
        }
        if (options.validateRowid) {
            // Validate that a specific Rowid is still valid
            await validateRow(options.validateRowid);
        }
        if (options.anchor) {
            // Anchor selected rows for a table 
            await adHocAnchorTables(options.anchor);
        }
        if (options.monitor) {
            // Watch for changes on selected tables and anchor those changes
            await checkTables(config.oracleTables);
            while (true) {
                await processTableChanges();
                await monitorSleep(options.monitor);
            }
        }
    } catch (error) {
        log.error(error.message);
        log.error(error.stack);
        process.exit(1);
    }
};

// Validate a rowid/timstamp key
const validateRow = async (rowidKey) => {
    // Output files
    const proofFile = `${rowidKey}.proof`;
    const dotFile = `${rowidKey}.dot`;
    const jsonFile = `${rowidKey}.json`;

    let dataRowidKey;
    let trieRowIdKey;

    const splitRowId = rowidKey.split('.');
    if (splitRowId.length === 1) {
        // This key doesn't have an SCN attached.  So we will compare the 
        // most recent rowid Key with the data associated with the current SCN
        const currentScn = await getSCN();
        dataRowidKey = rowidKey + '.' + currentScn;
        trieRowIdKey = await getLatestRowidKey(rowidKey); // Get most recent rowidkey

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
    } = await getTrieForRowid(trieRowIdKey);
    const proofId = (await proofableClient.getTrieProof(trie.getId())).getId();

    // Get the current state of data
    const rowData = await getRowData(tableOwner, tableName, dataRowidKey);
    log.trace('key/value for rowProof ', rowData);
    // Change rowData key to match trie key 
    // (eg, make the rowid.scn number the same as is in the trie)
    rowData.key = trieRowIdKey;

    // generate a rowProof based on the trie and current data
    const rowProof = await generateRowProof(rowData, trie, proofId, proofFile, dotFile);
    if (rowProof.keyValues.total === rowProof.keyValues.passed &&
        rowProof.keyValues.passed === 1) {
        log.info('Rowid validation passed ', rowProof.keyValues);
    } else {
        log.error('Rowid Validate FAILED! ', rowProof.keyValues);
    }
    const jsonData = JSON.stringify({
        rowData,
        rowProof
    });
    await fs.writeFileSync(jsonFile, jsonData);
    log.info('proof created - JSON format: ', jsonFile);
    log.info('                binary     : ', proofFile);
    log.info('                digraph    : ', dotFile);
    return (rowProof);

};

// Add a table to the config (unimplemented)
const register = async () => {
    const tableNames = options.register;
    if (!('oracleTables' in config)) {
        config.oracleTables = [];
    }

    tableNames.forEach((tableName) => {
        const tableDef = {};
        tableDef[tableName] = {
            name: tableName
        };
        if (options.registerFilter) {
            tableDef[tableName][filter] = options.registerFilter;
        }
        config.oracleTables.push(tableDef);
        log.trace(tableDef);
    });

    await saveConfig();
};

// Save current configuration to the configuration file (unimplemented)
const saveConfig = async () => {
    const newConfig = yaml.safeDump(config);
    const timestamp = new Date().getTime();
    const newFileName = timestamp + '.' + options.config;
    fs.writeFileSync(newFileName, newConfig);
    log.info('Wrote new config to ', newFileName);
    log.trace(newConfig);
};

// Get data for a specific rowid key
// A rowid Key is the in the format rowid.scn
const getRowData = async (tableOwner, tableName, rowidKey) => {
    log.info('Getting data for ', rowidKey);

    const therowid = rowidKey.split('.')[0];
    const scn = rowidKey.split('.')[1];
    const tableOwnerName = `${tableOwner}.${tableName}`;
    const sqlText = `
        SELECT rowidtochar(c.rowid) AS row_rowid, c.*
          FROM ${tableOwnerName} AS OF SCN :scn c
         WHERE ROWID = :therowid`;

    const result = await oraConnection.execute(sqlText, {
        scn,
        therowid
    });

    assert(result.rows.length === 1, 'Only one row returned for rowid_scn');
    const row = result.rows[0];
    const jsonRow = ora2json(result);
    log.trace(jsonRow);

    const key = rowidKey;
    const hash = crypto.createHash('sha256').update(stringify(row)).digest('base64');
    return ({
        key,
        hash,
        jsonRow
    });
};

// Wait on a timeout but awake if someone fires the provendb_alert alert
const monitorSleep = async (timeout) => {
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
};

// Connect to Oracle
const connectToOracle = async () => {
    log.info('Connecting to Oracle');
    oraConnection = await oracledb.getConnection({
        connectString: config.oracleConnection.connectString,
        user: config.oracleConnection.user,
        password: config.oracleConnection.password,
    });
    log.info('Connected to Oracle');
    return (oraConnection);
};

// Process changes for all registered tables 
const processTableChanges = async () => {
    log.info('Processing all table changes');

    const tableNames = Object.keys(tableDefs);
    for (let tableNo = 0; tableNo < tableNames.length; tableNo++) {
        const tableDef = tableDefs[tableNames[tableNo]];
        log.trace('Processing ', tableDef);
        const tableData = await process1TableChanges(tableDef);
        if (Object.keys(tableData.keyValues).length > 0) {
            const anchoredTrie = await anchorData(tableData, config.anchorType);
            await saveTrieToDB(anchoredTrie.getTrieId(), tableDef.tableOwner,
                tableDef.tableName, tableData, 'Monitor');
        } else {
            log.info('No new data to anchor');
        }

    }
};

// List known versions of a specific Rowid
const listEntries = async (rowid) => {
    try {
        log.info('Listing entries for ', rowid);
        const rowidPattern = `${rowid}.%`;
        const sqlText = `
            SELECT rowid_scn,trieid,start_time,end_time 
            FROM proofablecontrolrowids 
            JOIN proofablecontrol USING(trieid)
            WHERE rowid_scn LIKE :1
            ORDER BY start_time 
    `;
        const result = await oraConnection.execute(
            sqlText, [rowidPattern],
        );
        if (result.rows.length === 0) {
            log.trace(`No matching rowIds found for ${rowid}`);
        } else {
            const format = '%-12s %-32s %-25s %-25s';
            console.log(sprintf(format, 'Rowid', 'key', 'startDate', 'endDate'));
            result.rows.forEach((row) => {
                console.log(rowid, row[0], row[2], row[3]);
            });
        }
    } catch (error) {
        log.error(error.stack);
    }
};

// Get the last recorded SCN for a monitored table 
const getTableLastSCN = async (tableOwner, tableName) => {
    try {
        let tableRegistered = false;
        const SQLText = `
        SELECT MAX(start_time) max_start_time, MAX(end_time) max_end_time,
               MAX(start_scn) max_start_scn,MAX(end_scn) max_end_scn,
               COUNT(*) count
          FROM proofablecontrol
         WHERE owner_name=:1 and table_name=:2 and trietype='Monitor'
    `;
        result = await oraConnection.execute(
            SQLText, [tableOwner, tableName]
        );
        const row = result.rows[0];
        if (row[4] > 0) {
            tableRegistered = true;
        }
        return ({
            maxStartTime: row[0],
            maxEndTime: row[1],
            maxStartScn: row[2],
            maxEndScn: row[3],
            tableRegistered
        });
    } catch (error) {
        log.error(error.stack);
    }
};

const getSCN = async () => {
    const SQLText = `
     SELECT CURRENT_SCN,flashback_on
       FROM v$database`;

    result = await oraConnection.execute(
        SQLText
    );
    const currentScn = result.rows[0][0];
    // const flashbackOn=result.rows[0][1];
    log.trace('Current SCN ', currentScn);

    return currentScn;
};

const getLatestRowidKey = async (rowid) => {
    result = await oraConnection.execute(
        `SELECT MAX(rowid_scn) max_rowid_scn
           FROM proofablecontrolrowids
          WHERE rowid_scn LIKE :1`,
        [rowid + '.%']
    );
    const highestRowidKey = result.rows[0][0];
    log.trace('Highest Rowid Key = ', highestRowidKey);
    return (highestRowidKey);
};

// Process changes for a single table 
const process1TableChanges = async (tableDef, adHoc) => {
    log.info('Processing ', ' ', tableDef.tableOwner, '.', tableDef.tableName);
    const tableName = `${tableDef.tableOwner}.${tableDef.tableName}`;
    const currentScn = await getSCN();
    log.trace('Current SCN ', currentScn);
    const lastProofableAnchor = await getTableLastSCN(tableDef.tableOwner, tableDef.tableName);
    log.trace(lastProofableAnchor);

    const rawTableData = await getTableData(tableName, tableDef, lastProofableAnchor, currentScn, adHoc);

    const processedTableData = processTableData(rawTableData, currentScn);

    return ({
        keyValues: processedTableData.keyValues,
        keyTimeStamps: processedTableData.keyTimeStamps,
        maxStartTime: processedTableData.maxStartTime,
        minStartTime: processedTableData.minStartTime,
        maxStartScn: processedTableData.maxStartScn,
        minStartScn: processedTableData.minStartScn
    });
};

const getTrieFromDB = async (trieId) => {
    log.info(`Getting ${trieId} from DB`);

    const options = {
        fetchInfo: {
            TRIE: {
                type: oracledb.STRING,
            },
        },
    };
    const data = await oraConnection.execute(`
      SELECT trie, owner_name, table_name,
             start_time, end_time
        FROM proofablecontrol
       WHERE trieid = :1
    `, [trieId], options);
    if (data.rows.length === 0) {
        log.error('Internal error retrieving trie ', trieId);
    }

    const trieDataOut = data.rows[0][0];
    const tableOwner = data.rows[0][1];
    const tableName = data.rows[0][2];
    const startTime = data.rows[0][3];
    const endTime = data.rows[0][4];
    log.info('Retrieved Trie ', trieId, ' for ', tableOwner, '.', tableName);
    log.info(' Data range ', startTime, ' to ', endTime);
    const trie = await parseTrie(trieDataOut);
    return trie;
};

// Take raw trie data and import it into a proper trie object
const parseTrie = async (trieData) => {
    const tmpFile = tmp.fileSync();
    const trieFileName = tmpFile.name;
    await fs.writeFileSync(trieFileName, trieData, {
        encoding: 'base64',
    });
    const trie = await proofableClient.importTrie('', trieFileName);
    return trie;
};

// Save a trie to the Proofablecontrol table
const saveTrieToDB = async (trieId, tableOwner, tableName, tableData, trieType) => {
    try {
        log.info(`Saving trie ${trieId} to db`);
        const tmpFile = tmp.fileSync();
        const trieFileName = tmpFile.name;

        await proofableClient.exportTrie(trieId, trieFileName);
        const trieData = fs.readFileSync(trieFileName, 'base64');

        // Create an array of bind variables for array insert
        const rowIdBindData = [];
        Object.keys(tableData.keyValues).forEach((key) => {
            // const timePart = new Date(Number(key.split('.')[1]));
            rowIdBindData.push([trieId, key, new Date(tableData.keyTimeStamps[key])]);
        });
        const insOut = await oraConnection.execute(
            `INSERT INTO proofablecontrol 
            (trieId, trie, owner_name, table_name, 
             start_time, end_time ,start_scn, end_scn,trieType) 
         VALUES(:1, :2, :3, :4, :5 , :6, :7, :8,:9)`,
            [trieId, trieData, tableOwner, tableName, new Date(tableData.minStartTime),
                new Date(tableData.maxStartTime),
                tableData.minStartScn, tableData.maxStartScn, trieType
            ],
        );
        log.info(`${insOut.rowsAffected} rows inserted into proofableControl`);

        const ins2Out = await oraConnection.executeMany(
            `INSERT INTO proofablecontrolrowids 
                   (trieId, rowid_scn, versions_starttime ) 
                    VALUES(:1, :2, :3 )`,
            rowIdBindData,
        );
        log.info(`${ins2Out.rowsAffected} rows inserted into proofableControlrowids`);
        await oraConnection.commit();
    } catch (error) {
        log.error(error.message);
    }
};

// Anchor data to a blockchain - create a trie and anchor that trie
const anchorData = async (data, anchorChainType) => {
    log.info('--> Anchoring data to ', anchorChainType);
    const inputData = await proofable.dataToKeyValues(data.keyValues);
    log.trace(inputData);
    const trie = await proofableClient.createTrieFromKeyValues(inputData);
    log.trace(trie);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const anchoredTrie = await proofableClient.anchorTrie(trie,
        proofable.Anchor.Type[anchorChainType]);
    log.trace('anchoredTrie->', anchoredTrie);
    return anchoredTrie;
};

const sleep = async (timeOut) => {
    await new Promise((resolve) => setTimeout(resolve, timeOut));
};

// Check that tables in the config file are valid 
const checkTables = async (tableList) => {
    log.info('Checking all tables');
    const flashbackArchives = await oraConnection.execute(`
      SELECT flashback_archive_name,last_purge_time FROM dba_flashback_archive
  `);
    log.trace(flashbackArchives.rows);
    for (let ti = 0; ti < tableList.length; ti++) {
        const table = tableList[ti];
        const splitTable = table.split('.');
        if (splitTable.length !== 2) {
            throw new Error('Tables should be defined in User.TableName format');
        }
        tableDefs[table] = await check1table(splitTable[0], splitTable[1]);
    }
    log.trace('tableDefs', tableDefs);
};

const tableExists = async (user, table) => {
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
    return (count === 1);
};

// Check a single table
const check1table = async (user, table) => {
    log.info('Checking ', user, '.', table);
    const tableData = {};
    tableData.tableOwner = user;
    tableData.tableName = table;
    if (await tableExists(user, table)) {

        const fbdaData = await getFBDAdetails(user, table);
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
    return (tableData);
};

// Return an oracle result set as array of simple JSON
const ora2json = (oraOutput) => {
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
    return (rows);
};

// Option definitions
const optionDefinitions = [{
        name: 'verbose',
        alias: 'v',
        type: Boolean,
        description: 'Verbose Output',
    },
    {
        name: 'config',
        type: String,
        multiple: false,
        description: 'Configuration File',
    },
    {
        name: 'validateRowid',
        type: String,
        multiple: false,
        description: 'Validate rowid.startTime identifier',
    },
    {
        name: 'listRowids',
        type: String,
        multiple: false,
        description: 'List entries for a particular Rowid',
    },
    {
        name: 'monitor',
        type: Number,
        multiple: false,
        description: 'process table changes every "number" seconds',
    },
    {
        name: 'anchor',
        type: String,
        multiple: true,
        description: 'Anchor data in a specific table'
    },
    {
        name: 'where',
        type: String,
        multiple: false,
        description: 'WHERE clause to apply to anchor argument'
    },
    {
        name: 'batchSize',
        type: Number,
        multiple: false,
        description: 'Proofs should contain at least this many rows',
    },
    {
        name: 'help',
        alias: 'h',
        type: Boolean,
        description: 'Print Help',
    },
];

// Print usage message
const usage = () => {
    const sections = [{
            header: 'Proofable for Oracle',
            content: 'Anchors Oracle data to public blockchains',
        },
        {
            header: 'Options',
            optionList: [],
        },
    ];
    sections[1].optionList = optionDefinitions;
    const usageText = commandLineUsage(sections);
    console.log(usageText);
};

// Validate/Create a row proof for a specific row using a pre-existing trie
const generateRowProof = async (rowData, trie, proofId, proofFile, dotFile) => {
    const proofableKey = proofable.Key.from(rowData.key.toString());
    const proofableKeyValuesFilter = proofable.KeyValuesFilter.from([proofableKey]);
    const dataValues = {};
    dataValues[rowData.key] = rowData.hash;
    const sortedValues = await proofable.sortKeyValues(
        proofable.dataToKeyValues(dataValues),
    );

    log.info('creating key values proof');
    log.trace('args ', trie.getId(), ' , ', proofId, ' , ',
        proofableKeyValuesFilter, ' , ', proofFile);
    try {
        await proofableClient.createKeyValuesProof(trie.getId(), proofId,
            proofableKeyValuesFilter, proofFile);
    } catch (error) {
        log.error(error.stack);
    }

    log.info('verifying proof');
    const docProof = await proofableClient.verifyKeyValuesProofWithSortedKeyValues(
        proofFile, sortedValues,
        dotFile,
    );
    log.trace(docProof);
    return docProof;
};

// Get trie for a specific rowidStarttime key
const getTrieForRowid = async (rowidStartTime) => {
    const result = await oraConnection.execute(`
        SELECT trieid,owner_name,table_name
        FROM proofablecontrolrowids JOIN proofablecontrol USING(trieid)  
        WHERE rowid_scn = :1
    `, [rowidStartTime]);
    if (result.rows.length === 0) {
        throw new Error('No such rowid.startTime - check proofableControlsRowids table');
    }

    const trieId = result.rows[0][0];
    const tableOwner = result.rows[0][1];
    const tableName = result.rows[0][2];
    log.info(`identifier ${rowidStartTime} is found in trie ${trieId}`);
    const trie = await getTrieFromDB(trieId);
    return {
        trie,
        tableOwner,
        tableName
    };
};


const adHocAnchorTables = async (tables) => {

    tables.forEach(async (userNameTableName) => {
        await adHocAnchorTable(userNameTableName);
    });
};

const adHocAnchorTable = async (userNameTableName) => {

    const splitTableName = userNameTableName.split('.');

    if (splitTableName.length != 2) {
        const errm = 'Table Definitions should be in user.table format';
        log.error(errm);
        return;
    }
    const userName = splitTableName[0];
    const tableName = splitTableName[1];
    const tableDef = await check1table(userName, tableName);
    if (tableDef.exists) {
        log.trace('Processing ', tableDef);
        const tableData = await process1TableChanges(tableDef, 'adhoc');
        log.trace(tableData);
        const anchoredTrie = await anchorData(tableData, config.anchorType);
        await saveTrieToDB(anchoredTrie.getTrieId(), tableDef.tableOwner,
            tableDef.tableName, tableData, 'AdHoc');
    }
};

const connectToProofable = async () => {
    /* To get a token:
    YOUR_TOKEN = "$(jq -r '.authToken' ~/Library/Application\ Support/ProvenDB/auth.json)"
    */
    log.info('Connecting to Proofable');

    if (!('proofable' in config)) {
        proofableClient = proofable.newAPIClient('api.dev.proofable.io:443');
    } else {
        if (!(('token' in config.proofable) && ('endpoint' in config.proofable))) {
            throw new Error('Must specify both token and endpoint in proofable config');
        }
        log.trace('Setting metadata token and endpoint');
        log.trace(config.proofable);
        const proofableMetadata = new proofable.grpc.Metadata();
        /*        proofableMetadata.add(
                   "authorization",
                   "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDMxNTA4OTIsImp0aSI6IkRtSHd5Q05TSUVZTERrYlk3dE1DWXRHVExabDFMQjM2S2lmbWtDN1JDNGs9Iiwic3ViIjoidTQ0eGl0dXhjbHZkdXRrNzg0aDI3cTlqIn0.ujgEZKfWn4Db4C-8geggu9fOUuS6B4iTpgkDuETwx0w");
         */
        const bearer = 'Bearer ' + config.proofable.token;
        log.trace(bearer);
        proofableMetadata.add(
            'authorization',
            bearer
        );
        proofableClient = proofable.newAPIClient(config.proofable.endpoint, proofableMetadata);
    }
    return (proofableClient);
};

// See if this table is flashback data archive managed. 
const getFBDAdetails = async (user, table) => {
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
    const jsonData = ora2json(fatData); // JSON version of data
    if (jsonData.length === 0) {
        log.info(`${user}.${table} is not flashback managed`);
        tableData.hasFBDA = false;
    } else {
        tableData = jsonData[0];
        tableData.lastPurgeTime = lastPurgeTime;
        tableData.hasFBDA = true;
    }
    return tableData;
};

// This is the query we use to get the first sample of data 
const firstTimeTableQuery = (tableName) => {
    const sqlText = `
        WITH table_versions AS (
            SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                    NVL(versions_starttime,SYSDATE) versions_starttime, 
                    versions_operation ,versions_startscn
            FROM ${tableName} VERSIONS BETWEEN SCN :startscn                      
            AND :currentscn C)
        SELECT * from table_versions 
        ORDER BY versions_starttime`;
    return (sqlText);
};

// This is the query we use to get changes since the last sample
const registeredTableQuery = (tableName) => {
    const sqlText = `
    WITH table_versions AS (
        SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                versions_startscn, versions_starttime, versions_operation 
        FROM ${tableName} VERSIONS BETWEEN SCN    
        :startscn 
        AND :currentscn C WHERE versions_startscn>=:startscn )
    SELECT * from table_versions         
    ORDER BY versions_startscn`;
    return (sqlText);
};

// Get table data for a specific SCN range 
const getTableData = async (tableName, tableDef, lastProofableAnchor, currentScn, adHoc) => {

    let sqlText;
    let startScn = currentScn;
    let result;

    if (adHoc) {
        sqlText = firstTimeTableQuery(tableName);
        startScn = currentScn;
    } else {
        if (lastProofableAnchor.tableRegistered) {
            sqlText = registeredTableQuery(tableName);
        } else {
            sqlText = firstTimeTableQuery(tableName);
        }
        log.trace('last max scn ', lastProofableAnchor.maxEndScn);

        if (lastProofableAnchor.maxEndScn !== null && lastProofableAnchor.maxEndScn > 0) {
            startScn = lastProofableAnchor.maxEndScn;
            // This is a second scan
        }
        log.info('Start SCN=', startScn, ' current SCN=', currentScn);
    }
    log.trace(sqlText);
    /* This logic might be needed later 
       result = await oraConnection.execute(
        noFBDASQL, {
            starttime: {
                type: oracledb.DB_TYPE_TIMESTAMP_TZ,
                val: starttime
            }
        }
    ); */
    try {
        result = await oraConnection.execute(
            sqlText, {
                startscn: startScn,
                currentscn: currentScn
            }
        );
    } catch (error) {
        log.error(error.message);
        if (error.errorNum === 30052) {
            // We don't have flashback data since the last monitored sample
            log.error('Insufficient flashback history to capture all changes since last sample');
            log.info('Attempting to retrieve current state');
            sqlText = firstTimeTableQuery(tableName);
            result = await oraConnection.execute(
                sqlText, {
                    startscn: currentScn,
                    currentscn: currentScn
                }
            );
        }

    }
    // log.trace('Table Data ', result);

    return result;

};

// Massage table data and create key/hash pairs
const processTableData = (result, currentScn) => {
    let rowidIdx;
    let startTimeIdx;
    let startScnIdx;

    for (let mi = 0; mi < result.metaData.length; mi++) {
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
        // log.trace('max/min SCN ', maxStartScn, ',', minStartScn);
        const versionStartTime = new Date(row[startTimeIdx]).getTime();
        const versionStartScn = row[startScnIdx];
        let keyScn = versionStartScn;
        if (versionStartScn === null) keyScn = currentScn;
        const key = `${row[rowidIdx]}.${keyScn}`;
        // log.trace('versionStartScn ', versionStartScn, ' ', typeof versionStartScn);
        if (versionStartTime > maxStartTime) maxStartTime = versionStartTime;
        if (versionStartTime < minStartTime) minStartTime = versionStartTime;
        if (versionStartScn > maxStartScn) maxStartScn = versionStartScn;
        if (versionStartScn > 0 && versionStartScn < minStartScn) minStartScn = versionStartScn;
        // remove last three columns from data to be hashed - they are Flashback metadata
        const data = row.slice(0, row.length - 3);
        const hash = crypto.createHash('sha256').update(stringify(data)).digest('base64');
        keyValues[key] = hash;
        keyTimeStamps[key] = versionStartTime;
        // log.trace('key: ', key, ' hash:', hash);
    });
    return {
        keyValues,
        keyTimeStamps,
        maxStartTime,
        minStartTime,
        maxStartScn,
        minStartScn
    };
};


main();