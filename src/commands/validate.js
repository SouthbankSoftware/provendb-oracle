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
    validateProof
} = require('../services/oracle');
const {
    connectToProofable
} = require('../services/proofable');

const {
    getConfig
} = require('../services/config');


// TODO: Need to include a readme in the zip file

// TODO: Out of memory errors
// TODO: Support for blockchain table types

// TODO: Should support a validate against a specific row proof (provide trie and rowid together)
// TODO: Validate fails if the proof was anchored with --includeScn
// TODO: If no output file selected, writes to 'undefined.provendb'

class ValidateCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(ValidateCommand);

            const {
                rowid,
                proofId,
                verbose
            } = flags;
            let outputFile;
            if (flags.output) {
                outputFile = flags.output;
            } else {
                outputFile = `${rowid}.provendb`;
            }

            if (!(rowid || proofId)) {
                throw new Error('Must specify either a rowid or a proofId;  try --help');
            }


            // Load Config
            const config = await getConfig(flags.config);

            if (verbose) {
                log.setLevel('trace');
                log.trace(config);
            }

            // Establish connection:
            await connectToOracle(config, verbose);
            await connectToProofable(config, verbose);

            // Command Specific Logic:

            if (rowid) {
                log.info(`Validating row: ${rowid}`);
                await validateRow(rowid, outputFile, verbose);
                log.info('Row proof written to ', outputFile);
            }
            if (proofId) {
                log.info(`Validating proofId: ${proofId}`);
                await validateProof(proofId, outputFile, verbose);
                if (outputFile) {
                    log.info('Proof written to ', outputFile);
                }
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
// TODO: Schema should use ProofId, not TrieId.

ValidateCommand.flags = {
    rowid: flags.string({
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