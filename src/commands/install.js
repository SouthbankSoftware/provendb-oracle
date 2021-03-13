const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const passwordPrompt = require('password-prompt');

const {
    connectToOracleSYS,
    installPDB4O,
    connectToOracle,
    connectToOracleDirect
} = require('../services/oracle');

const {
    saveConfig
} = require('../services/config');

// TODO: Use Oracle JSON tables

class InstallCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(InstallCommand);
            let {
                verbose,
                oracleConnect,
                provendbUser,
                provendbPassword,
                dropExisting,
                createDemoAccount,
                dbaUserName,
                dbaPassword,
                sysPassword
            } = flags;

            if (verbose) {
                log.setLevel('trace');
            }
            log.trace(flags);
            let loginMethod = 'SYS';

            let effectiveDbaPassword = dbaPassword;

            if (!flags.sysPassword && !flags.dbaUserName && !flags.dbaPassword) {
                // TODO: Assignment to contant variable error caused here
                sysPassword = await passwordPrompt('Enter SYS password: ', {
                    method: 'mask'
                });
            } else if (flags.dbaUserName) {
                loginMethod = 'DBA';
                if (!flags.dbaPassword) {
                    effectiveDbaPassword = await passwordPrompt(`Enter ${dbUserName} password: `, {
                        method: 'mask'
                    });
                } else {
                    effectiveDbaPassword = dbaPassword;
                }
            }

            let dbaConnection;
            if (loginMethod === 'SYS') {
                log.trace('Connecting to sys');
                dbaConnection = await connectToOracleSYS(oracleConnect, sysPassword, verbose);
            } else {
                log.trace('Connecting to DBA');
                dbaConnection = await connectToOracleDirect(oracleConnect, dbaUserName, effectiveDbaPassword, verbose);
            }
            await installPDB4O(oracleConnect, dbaConnection, provendbUser, provendbPassword, dropExisting, createDemoAccount, verbose);
            if (flags.config) {
                await saveConfig(flags.config, provendbUser, oracleConnect, provendbPassword);
            }
        } catch (error) {
            log.error('Failed to install:');
            log.error(error.message);
        }
    }
}

InstallCommand.description = `Installs the ProvenDB for Oracle users and tables
`;

InstallCommand.flags = {

    verbose: flags.boolean({
        char: 'v',
        description: 'increased logging verbosity',
        default: false
    }),
    config: flags.string({
        description: 'Create config file',
        required: false
    }),
    oracleConnect: flags.string({
        description: 'Oracle connection String',
        required: true
    }),
    sysPassword: flags.string({
        description: 'SYS Password (instead of DBA username/password)',
        required: false
    }),
    dbaPassword: flags.string({
        description: 'DBA Password',
        required: false
    }),
    dbaUserName: flags.string({
        description: 'DBA Username',
        required: false
    }),
    provendbUser: flags.string({
        description: 'ProvenDB User Name (defaut: provendb)',
        default: 'provendb'
    }),
    provendbPassword: flags.string({
        description: 'ProvenDB User Password',
        required: true
    }),
    dropExisting: flags.boolean({
        description: 'Drop existing users if they exist',
        default: false
    }),
    createDemoAccount: flags.boolean({
        description: 'Create the ProofableDemo account ',
        default: false
    }),
};

module.exports = InstallCommand;
