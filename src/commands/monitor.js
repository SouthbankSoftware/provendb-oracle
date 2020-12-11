const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const {
    connectToOracle,
    processTableChanges,
    checkTables,
    monitorSleep,
} = require('../services/oracle');
const {
    connectToProofable
} = require('../services/proofable');
const {
    getConfig
} = require('../services/config');

// TODO: Where clause filter for monitor
// TODO: Allow table list to be specified on command line

class MonitorCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(MonitorCommand);
            const {
                interval,
                verbose
            } = flags;

            // Load Config
            const config = await getConfig(flags.config);

            if (verbose) {
                log.setLevel('trace');
                log.trace(config);
            }

            // Establish connection:
            await connectToOracle(config, verbose);
            await connectToProofable(config, verbose);
            await checkTables(config.oracleTables);
            log.info(`Monitoring with ${interval}ms interval.`);
            // eslint-disable-next-line no-constant-condition
            while (true) {
                await processTableChanges(config);
                await monitorSleep(interval, config);
            }
        } catch (error) {
            log.error('Failed to monitor database:');
            log.error(error.message);
        }
    }
}

MonitorCommand.description = `Monitor the database for changes.
...
Monitor checks tables listed in the configuration file for changes.   
Any changes to rows found will be anchored to the blockchain defined
in the configuration file. 
`;

MonitorCommand.flags = {
    interval: flags.integer({
        char: 'i',
        description: 'polling interval',
        default: 120
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

module.exports = MonitorCommand;