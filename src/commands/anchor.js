/* eslint no-await-in-loop:0 */
/* eslint no-plusplus:0 */
const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const {
    connectToOracle,
    getTableDef,
    getTableData,
    saveproofToDB,
    createProofFile,
    anchor1table
} = require('../services/oracle');
const {
    anchorData
} = require('../services/proofable');
const {
    getConfig
} = require('../services/config');

const debug = false;

class AnchorCommand extends Command {
    async run() {
        try {
            // Extract flags.

            const {
                flags
            } = this.parse(AnchorCommand);

            let whereClause;
            let columnList = '*';

            const {
                tables,
                where,
                includeRowIds,
                includeScn,
                verbose,
                columns
            } = flags;
            const outputFile = flags.validate;
            if (where) {
                whereClause = where.join(' ');
            }


            if (columns) {
                columnList = columns;
            }
            log.info(`Anchoring Tables: ${tables}`);

            if (verbose) {
                log.setLevel('trace');
            }

            if (includeScn && columnList) {
                log.warn('Column List currently ignored when SCN is specified');
                // TODO: Allow column lists and includeScn flags
            }
            const config = await getConfig(flags.config);

            // Establish connection:
            await connectToOracle(config, verbose);
            // await connectToProofable(config, verbose);

            // Command Specific Logic:

            // tables.forEach(async (userNameTableName) => {
            for (let ti = 0; ti < tables.length; ti++) {
                const userNameTableName = tables[ti];
                const splitTableName = userNameTableName.split('.');
                if (splitTableName.length != 2) {
                    const errm = 'Table Definitions should be in user.table format';
                    log.error(errm);
                    return;
                }
                const userName = splitTableName[0];
                const tableName = splitTableName[1];
                const tableDef = await getTableDef(userName, tableName);
                if (tableDef.exists) {
                    log.trace('Processing ', tableDef);
                    const tableData = await getTableData(tableDef, true, whereClause, includeScn, null, columnList);
                    const treeWithProof = await anchorData(tableData, config.anchorType, config.proofable.token, verbose);
                    if (debug) {
                        console.log(treeWithProof);
                        console.log(Object.keys(treeWithProof));
                    }
                    const proof = treeWithProof.proofs[0];
                    const proofId = proof.id;
                    await saveproofToDB(
                        treeWithProof,
                        tableDef.tableOwner,
                        tableDef.tableName,
                        tableData,
                        'AdHoc',
                        whereClause,
                        includeScn,
                        columnList
                    );
                    log.info(`Proof ${proofId} created and stored to DB`);
                    if (flags.validate) {
                        await createProofFile(treeWithProof, outputFile, includeRowIds, verbose);
                        log.info('Proof written to ', outputFile);
                    }
                }
            }
        } catch (error) {
            log.error('Failed to anchor tables:');
            log.error(error.stack);
            log.error(error.message);
        }
    }
}

AnchorCommand.description = `Anchor one or more tables to the blockchain.
Anchor reads the current state of selected table, filtered by an options WHERE 
clause.  Rows are hashed and anchored to the blockchain. 
`;

AnchorCommand.flags = {
    tables: flags.string({
        string: 't',
        description: 'tables to anchor',
        required: true,
        multiple: true,
    }),
    columns: flags.string({
        string: 'c',
        description: 'columns to be included in the proof',
        required: false,
        multiple: false,
    }),
    where: flags.string({
        string: 'w',
        description: 'WHERE clause to filter rows',
        required: false,
        multiple: true,
    }),
    validate: flags.string({
        string: 'o',
        description: 'Validate the proof and output to file',
        required: false,
        multiple: false,
    }),
    includeRowIds: flags.boolean({
        description: 'Include proofs for every row in the proof file',
        required: false,
        multiple: false,
    }),
    includeScn: flags.boolean({
        description: 'Include SCN into rowid signature (create historical proof)',
        default: false
    }),
    verbose: flags.boolean({
        char: 'v',
        description: 'increased logging verbosity',
        default: false
    }),
    config: flags.string({
        string: 'c',
        description: 'config file location',
        required: false
    }),
};

module.exports = AnchorCommand;
