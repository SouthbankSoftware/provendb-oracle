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
    anchor1table,
    anchor1Table
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
                await anchor1Table(config, userNameTableName, whereClause, columnList, flags.validate, includeScn, includeRowIds, verbose);

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