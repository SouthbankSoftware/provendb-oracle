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


class MonitorCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(MonitorCommand);
            const {
                tables,
                interval,
                maxTime,
                verbose
            } = flags;

            // Load Config
            const config = await getConfig(flags.config);

            if (verbose) {
                log.setLevel('trace');
                log.trace(config);
            }
            if (!tables) {
                throw new Error('Must specify --tables option');
            }
            // Establish connection:
            await connectToOracle(config, verbose);
            await checkTables(tables);
            log.info(`Monitoring with ${interval} s interval.`);
            // eslint-disable-next-line no-constant-condition

            const monitorStartTime = (new Date().getTime());
            let monitorLoop = true;
            while (monitorLoop) {
                const elapsedTime = (new Date().getTime()) - monitorStartTime;
                log.trace(`Elapsed time ${elapsedTime}`);
                if ((elapsedTime > (maxTime * 1000)) && maxTime > 0) {
                    log.info(`Max monitoring time ${maxTime} exceeded`);
                    log.info('Exiting');
                    monitorLoop = false;
                    break;
                }
                await processTableChanges(config, tables);
                await monitorSleep(interval, config);
            }
        } catch (error) {
            log.error('Failed to monitor database:');
            log.error(error.message);
        }
    }
}

MonitorCommand.description = `Monitor the database for changes.

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
    maxTime: flags.integer({
        char: 'm',
        description: 'Maximum number of seconds to monitor',
        default: 0
    }),
    verbose: flags.boolean({
        char: 'v',
        description: 'increased logging verbosity',
        default: false
    }),
    tables: flags.string({
        string: 't',
        description: 'tables to anchor',
        required: true,
        multiple: true,
    }),
    config: flags.string({
        string: 'c',
        description: 'config file location',
        required: false
    })
};

module.exports = MonitorCommand;
