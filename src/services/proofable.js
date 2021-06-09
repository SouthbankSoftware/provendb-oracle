/*
 * Encapsulates all the relevant functions for interacting with Proofable APIs.
 *
 * Copyright (C) 2020  Southbank Software Ltd.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *
 * @Author: Guy Harrison
 */

const fs = require('fs');
const log = require('simple-node-logger').createSimpleLogger();
const proofable = require('proofable');
const chainpointParse = require('chainpoint-parse');
const chainpointBinary = require('chainpoint-binary');
const tmp = require('tmp');
const axios = require('axios');
const {
    merkle,
    anchor
} = require('provendb-sdk-node');

const debug = false;

let proofableClient;


module.exports = {
    // Directly access the proofable client for functions using proofable APIs that fall under the Oracle umbrella.
    validateBlockchainHash: async (anchorType, txnId, expectedValue, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        let hashOut;
        // TODO: mainnet anchor support
        if (anchorType === 'ETH') {
            hashOut = await module.exports.lookupEthTxn(txnId, verbose = false);
            log.trace('txnOut ', hashOut);
        } else if (anchorType === 'HEDERA') {
            hashOut = await module.exports.lookupHederaTxn(txnId, verbose = false);
            log.trace('txnOut ', hashOut);
        } else {
            log.warn(`Do not know how to validate ${anchorType} blockchain entries`);
            return (true);
        }
        log.info(`${anchorType} transaction ${txnId} has hash value ${hashOut}`);
        if (expectedValue === hashOut) {
            log.info('PASS: blockchain hash matches proof hash');
            return (true);
        }
        log.info('FAIL: blockchain hash does not match expected hash from proof');
        return (false);
    },
    lookupEthTxn: async (transactionId, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const apiKey = 'XV98BFQPFGWMDKHWH6NSQ1VM74S3ABTKZS';
        const txRest = 'https://api-rinkeby.etherscan.io/api?module=proxy&action=eth_getTransactionByHas'
            + 'h&txhash=' + transactionId + '&apikey=' + apiKey;
        try {
            const config = {
                method: 'get',
                url: txRest,
                headers: {}
            };
            const response = await axios(config);
            let result = response.data.result.input;
            const match0x = result.match(/0x(.*)/);
            if (match0x.length > 1) {
                result = match0x[1];
            }

            return (result);
        } catch (error) {
            throw new Error(error);
        }
    },
    lookupHederaTxn: async (transactionId, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        // Get a document out of the vault
        const endPoint = 'https://api.testnet.kabuto.sh/v1/transaction/' + transactionId;
        try {
            const config = {
                method: 'get',
                url: endPoint
            };
            const response = await axios(config);
            return (response.data.memo);
        } catch (error) {
            throw new Error(error);
        }
    },
    // Validate data against an existing proof
    validateData: async (proof, inputKeyValues, outputFile, metadata, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        let goodProof = false;
        const builder = new merkle.Builder('sha-256');
        const keyValues = [];
        Object.keys(inputKeyValues).sort().forEach((key) => {
            keyValues.push({
                key,
                value: Buffer.from(inputKeyValues[key])
            });
        });
        builder.addBatch(keyValues);
        const tree = builder.build();
        const calculatedRoot = tree.getRoot();
        const proofRoot = proof.proofs[0].hash;
        if (calculatedRoot === proofRoot) {
            log.info('PASS: data hash matches proof hash');
            goodProof = true;
        } else {
            log.error(`FAIL: proof hash does not match data hash proof: ${proofRoot}, data: ${calculatedRoot}`);
            goodProof = false;
        }
        // TODO: Should compress this file
        if (goodProof) {
            const proofDoc = {
                metadata,
                tree: proof
            };
            log.info('Wrote proof to', outputFile);
            await fs.writeFileSync(outputFile, JSON.stringify(proofDoc));
        }
        return (goodProof);
    },
    // TODO: Create a demo script for p4o

    // Anchor data to a blockchain - create a trie and anchor that trie
    anchorData: async (data, anchorChainType) => {
        try {
            log.info('--> Anchoring data to ', anchorChainType);
            log.info(Object.keys(data.keyValues).length, ' keys');
            const builder = new merkle.Builder('sha-256');
            // TODO: Use dev anchor optionally not local anchor
            const myAnchor = anchor.connect(anchor.withAddress('localhost:10008'), anchor.withInsecure(true));
            // const myAnchor = anchor.connect(anchor.withAddress('anchor.dev.proofable.io:443'));

            const keyValues = [];
            Object.keys(data.keyValues).sort().forEach((key) => {
                keyValues.push({
                    key,
                    value: Buffer.from(data.keyValues[key])
                });
            });
            builder.addBatch(keyValues);
            const tree = builder.build();


            const anchoredProof = await myAnchor.submitProof(tree.getRoot(),
                anchor.submitProofWithAnchorType(anchor.Anchor.Type[anchorChainType]),
                anchor.submitProofWithAwaitConfirmed(true));

            tree.addProof(anchoredProof);
            log.trace('tree', tree);
            if (debug) {
                console.log('=======');
                console.log(tree);
                console.log('=======');
            }
            log.info('Anchored to ', anchoredProof.metadata.txnUri);
            return (tree);
        } catch (error) {
            log.info(error.message);
            log.error(error.trace);
            throw new Error(error);
        }
    },
    // TODO: Retry txn timed out errors on hedera
    connectToProofable: async (config) => {
        /* To get a token:
          YOUR_TOKEN = "$(jq -r '.authToken' ~/Library/Application\ Support/ProvenDB/auth.json)"
          */
        log.trace('Connecting to ProvenDB');

        if (!('proofable' in config)) {
            proofableClient = proofable.newAPIClient('api.dev.proofable.io:443');
        } else {
            if (!('token' in config.proofable && 'endpoint' in config.proofable)) {
                throw new Error('Must specify both token and endpoint in proofable config');
            }
            log.trace('Setting metadata token and endpoint');
            log.trace(config.proofable);
            const proofableMetadata = new proofable.grpc.Metadata();
            /*        proofableMetadata.add(
                           "authorization",
                           "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDMxNTA4OTIsImp0aSI6IkRtSHd5Q05TSUVZTERrYlk3dE1DWXRHVExabDFMQjM2S2lmbWtDN1JDNGs9Iiwic3ViIjoidTQ0eGl0dXhjbHZkdXRrNzg0aDI3cTlqIn0.ujgEZKfWn4Db4C-8geggu9fOUuS6B4iTpgkDuETwx0w");
                 */
            const bearer = 'Bearer ' + config.proofable.token;
            log.trace(bearer);
            proofableMetadata.add('authorization', bearer);
            proofableClient = proofable.newAPIClient(config.proofable.endpoint, proofableMetadata);
        }
        return proofableClient;
    },
    parseProof: (textProof, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const proof = JSON.parse(textProof);
        const parsedProof = merkle.importTree({
            algorithm: proof.algorithm,
            data: proof.layers,
            proofs: proof.proofs
        });
        log.trace('parsed Proof leaves ', parsedProof.getLeaves());
        return (parsedProof);
    },
    // Validate/Create a row proof for a specific row using a pre-existing trie
    // TODO: Ask Guan to give me a way of generating these in batches
    validateProof: async (proof, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const debug = false;
        try {
            log.trace('proof in validateProof', proof);
            let objectProof = proof.data;
            // TODO: Not sure why this is neccessary but otherwise Chainpoint barfs on proof
            if (true) {
                objectProof = JSON.parse(JSON.stringify(proof.data));
            }

            if (debug) console.log(JSON.stringify(objectProof));
            log.trace('object proof', objectProof);
            // Check that we can convert to chainpont Binary
            const binaryProof = await chainpointBinary.objectToBinarySync(objectProof);
            log.trace('binary proof', binaryProof);
            if (debug) console.log(binaryProof);

            // Parse the proof using chainpoint libraries
            const parsedProof = chainpointParse.parse(binaryProof);
            log.trace('parsed Proof', parsedProof);
            if (debug) console.log(JSON.stringify(parsedProof));
            // const expectedValue = parsedProof.branches[0].branches[0].anchors[0].expected_value;
            const expectedValue = findVal(parsedProof, 'expected_value');
            log.trace('expectedValue ', expectedValue);
            return ({
                expectedValue,
                parsedProof
            });
        } catch (error) {
            log.error(error.message, ' while validating proof');
            log.error(error.stack);
            throw error;
        }
    },

    generateRowProof: async (proof, rowId, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            log.trace('adding ', rowId, ' to proof ', proof);
            const rowProof = proof.addPathToProof(proof.proofs[0], rowId, 'rowid_branch');
            log.trace('rowProof ', rowProof);
            return rowProof;
        } catch (error) {
            log.error(error.message, ' while geneating row proof');
            log.error(error.stack);
        }
    }
};

function findVal(object, key) {
    let value;
    Object.keys(object).some((k) => {
        if (k === key) {
            value = object[k];
            return true;
        }
        if (object[k] && typeof object[k] === 'object') {
            value = findVal(object[k], key);
            return value !== undefined;
        }
    });
    return value;
}
