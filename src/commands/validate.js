const {
    Command,
    flags
} = require('@oclif/command');
const yaml = require('js-yaml');
const fs = require('fs');
const log = require('simple-node-logger').createSimpleLogger();
const tmp = require('tmp');
const {
    connectToOracle,
    validateRow,
    validateOracleProof
} = require('../services/oracle');

const {
    getConfig
} = require('../services/config');

class ValidateCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(ValidateCommand);

            const {
                rowId,
                proofId,
                verbose,
                generateCertificate,
            } = flags;

            if (!(rowId || proofId)) {
                throw new Error('Must specify either a rowid or a proofId;  try --help');
            }

            let outputFile;
            if (flags.output) {
                outputFile = flags.output;
            } else if (flags.rowId) {
                const rowIdFile = rowId.replace(/\//g, '-'); // Sometimes rowIds have "/"
                outputFile = `${rowIdFile}.provendb`;
            } else {
                outputFile = `${proofId}.provendb`;
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

            if (rowId) {
                log.info(`Validating row: ${rowId}`);

                // TODO: Need to accept a Proof here as well.
                await validateRow(rowId, outputFile, generateCertificate, config, verbose);

                log.info('Row proof written to ', outputFile);
            }
            if (proofId) {
                log.info(`Validating proofId: ${proofId}`);

                // TODO: Need to compress the output file
                await validateOracleProof(proofId, outputFile, verbose);
            }
        } catch (error) {
            log.error('Failed to validate row:');
            log.error(error.message);
        }
    }
}

ValidateCommand.description = `Validate Oracle data against a blockchain proof

Validate compares the data in the database (or in the flashback archive) to the 
digital signature (hash value) that was created when the row was anchored.  It then
confirms that the hashes match and that the hash is included in the blockchain anchor.

Validate generates a proof file which contains the row data and anchor information.  This 
proof file can serve as an independent proof of the data. 
`;


ValidateCommand.flags = {
    rowId: flags.string({
        string: 'r',
        description: 'row ID to validate',
        required: false,
    }),
    proofId: flags.string({
        string: 'r',
        description: 'proofId to validate',
        required: false,
    }),
    output: flags.string({
        string: 'o',
        description: 'output file for proof',
        required: false,
    }),
    generateCertificate: flags.boolean({
        string: 'c',
        description: 'Include PDF certificate with row proof',
        required: false,
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

module.exports = ValidateCommand;
