const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const passwordPrompt = require('password-prompt');

const {
    connectToOracleSYS,
    installPDB4O
} = require('../services/oracle');

const {
    saveConfig
} = require('../services/config');

// TODO: Allow installer to specify a Oracle account name 
// TODO: Use Oracle JSON tables

class InstallCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(InstallCommand);
            const {
                verbose,
                oracleConnect,
                provendbUser,
                provendbPassword,
                dropExisting,
                createDemoAccount
            } = flags;

            if (verbose) {
                log.setLevel('trace');
            }
            log.trace(flags);

            let sysPassword;
            if (!flags.sysPassword) {
                sysPassword = await passwordPrompt('Enter SYS password: ', {
                    method: 'mask'
                });
            } else {
                sysPassword = flags.sysPassword;
            }
            const sysConnection = await connectToOracleSYS(oracleConnect, sysPassword, verbose);
            await installPDB4O(oracleConnect, sysConnection, provendbUser,provendbPassword, dropExisting, createDemoAccount, verbose);
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
        description: 'SYS Password',
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
