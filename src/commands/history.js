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
} = require('../services/oracle');

const {
    getConfig
} = require('../services/config');



// TODO: Allow history to take a table and where clause criteria

class HistoryCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(HistoryCommand);

            const {
                rowid,
                tables,
                where,
                verbose
            } = flags;

            if (!tables && !rowid) {
                throw new Error('Must specify either rowid or tables argument, try --help');
            }
            if (tables && rowid) {
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

            // Command Specific Logic:
            if (rowid) {
                await listEntries(rowid);
            }
            if (tables) {
              await listTableEntries(tables, where);
            }
        } catch (error) {
            log.error('Failed to fetch history');
            log.error(error.message);
        }
    }
}

HistoryCommand.description = `List version history for a specific rows
...
Show the rowids and optionally SCNs for which we have anchored proofs
`;

HistoryCommand.flags = {
    rowid: flags.string({
        string: 'r',
        description: 'row ID to fetch versions for',
        required: false,
    }),
    tables: flags.string({
        string: 't',
        description: 'tablenames to search (username.tablename)',
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
