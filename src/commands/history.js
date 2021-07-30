const {
    sprintf
} = require('sprintf-js');

const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const {
    connectToOracle,
    listEntries,
    listTableEntries,
    listProofs,
} = require('../services/oracle');

const {
    getConfig
} = require('../services/config');

class HistoryCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(HistoryCommand);

            const {
                rowId,
                tables,
                where,
                verbose,
                proofOnly
            } = flags;

            if (!tables && !rowId && !proofOnly) {
                throw new Error('Must specify either rowid or tables argument, try --help');
            }
            if (tables && rowId) {
                throw new Error('Must specify only one of rowid or tables argument, try --help');
            }



            // Load Config
            const config = await getConfig(flags.config);

            if (verbose) {
                log.setLevel('trace');
                log.trace(config);
            }

            // Establish connection:
            await connectToOracle(config, verbose);

            if (proofOnly) {
                await listProofs(tables);
            } else {
            // Command Specific Logic:
                if (rowId) {
                    await listEntries(rowId);
                }
                if (tables) {
                    await listTableEntries(tables, where);
                }
            }
        } catch (error) {
            log.error('Failed to fetch history');
            console.log(error.trace);
            log.error(error.message);
        }
    }
}

HistoryCommand.description = `List version history for a specific rows
...
Show the rowids and optionally SCNs for which we have anchored proofs
`;

HistoryCommand.flags = {
    rowId: flags.string({
        string: 'r',
        description: 'row ID to fetch versions for',
        required: false,
    }),
    tables: flags.string({
        string: 't',
        description: 'tablenames to include (username.tablename)',
        required: false,
        multiple: true,
    }),
    proofOnly: flags.boolean({
        string: 'p',
        description: 'list Proofs only (noRowids)',
        required: false,
        multiple: true,
    }),
    where: flags.string({
        string: 'w',
        description: 'WHERE clause to filter rows',
        required: false,
        multiple: false,
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

module.exports = HistoryCommand;
