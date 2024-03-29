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
const chainpointParse = require('chainpoint-parse');
const chainpointBinary = require('chainpoint-binary');
// const tmp = require('tmp');
const axios = require('axios');
const Path = require('path');
const {
    merkle,
    anchor
} = require('provendb-sdk-node');
const {
    async
} = require('regenerator-runtime');

const debug = false;

const dragonGlassAccessKey = '79120886-f78a-3c5b-a51c-7dcec82607b5';
const dragonGlassAPIKey = '1a0fc3645c05847d43fd58dffae1986436658ba2';
const dragonGlassTestNetAccessKey = '4b3c47f5-d457-359b-99dd-51b979f51590';
const dragonGlassTestNetAPIKey = 'd21319e0ce1d737891ea28f5501f2a0aff6da5f1';



module.exports = {
    // Directly access the proofable client for functions using proofable APIs that fall under the Oracle umbrella.
    validateBlockchainHash: async (anchorType, txnId, expectedValue, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
            log.trace('validatBlockchainHash');
        }
        let hashOut;
        // TODO: mainnet anchor support
        if (anchorType === 'ETH') {
            hashOut = await module.exports.lookupEthTxn(txnId, verbose);
            log.trace('txnOut ', hashOut);
        } else if (anchorType === 'HEDERA') {
            // hashOut = await module.exports.lookupHederaTxn(txnId, verbose);
            hashOut = await lookupHederaDragonGlass(txnId, 'testnet');
            log.trace('txnOut ', hashOut);
        } else if (anchorType === 'HEDERA_MAINNET') {
            // hashOut = await module.exports.lookupHederaMainNetTxn(txnId, verbose);
            hashOut = await lookupHederaDragonGlass(txnId, 'mainnet');
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
    genProofCertificate: async (proof, fileName, apiKey, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const endPoint = 'https://api.provendocs.com/api/getCertificate/';

        const path = Path.resolve(fileName);
        const writer = fs.createWriteStream(path);
        try {
            const config = {
                method: 'post',
                url: endPoint,
                responseType: 'stream',
                headers: {
                    'Authorization': apiKey
                },
                data: proof
            };
            log.trace(config);
            const response = await axios(config);
            log.trace(response);
            response.data.pipe(writer);
            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    writer.close();
                    resolve(path);
                });
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(error);
        }
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
        let config;
        let response;
        // Get a document out of the vault
        const endPoint = 'https://api.testnet.kabuto.sh/v1/transaction/' + transactionId;
        try {
            config = {
                method: 'get',
                url: endPoint
            };
            log.trace(config);
            response = await axios(config);
            return (response.data.memo);
        } catch (error) {
            log.error(error.message);
            log.error(config);
            log.error(response);
            return (false);
        }
    },
    lookupHederaMainNetTxn: async (transactionId, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        let config;
        let response;
        // Get a document out of the vault
        const endPoint = 'https://api.kabuto.sh/v1/transaction/' + transactionId;
        try {
            config = {
                method: 'get',
                url: endPoint
            };
            log.trace(config);
            response = await axios(config);
            return (response.data.memo);
        } catch (error) {
            log.error(error.message);
            log.error(config);
            log.error(response);
            return (false);
        }
    },
    // Validate data against an existing proof
    validateData: async (proof, inputKeyValues, outputFile, metadata, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        let goodProof = false;
        let badKeys = [];

        const tree = makeTree(inputKeyValues, verbose);
        const calculatedRoot = tree.getRoot();
        const proofRoot = proof.proofs[0].hash;
        if (calculatedRoot === proofRoot) {
            log.info('PASS: data hash matches proof hash');
            goodProof = true;
        } else {
            log.error(`FAIL: proof hash does not match data hash proof: ${proofRoot}, data: ${calculatedRoot}`);
            goodProof = false;
            badKeys = getBadKeys(proof, tree);
            log.trace(badKeys);
        }
        // TODO: Should compress this file
        if (goodProof) {
            const proofDoc = {
                metadata,
                tree: proof
            };
            log.info('Wrote proof to ', outputFile);
            await fs.writeFileSync(outputFile, JSON.stringify(proofDoc));
        }
        log.trace('goodProof=', goodProof);
        return ({goodProof, badKeys});
    },
    // TODO: Create a demo script for p4o

    // Anchor data to a blockchain - create a trie and anchor that trie
    anchorData: async (data, anchorChainType, anchorToken, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const debug = false;
        try {
            log.info('--> Anchoring data to ', anchorChainType);
            log.info(Object.keys(data.keyValues).length, ' keys');

            // TODO: Use dev anchor optionally not local anchor
            log.trace('token ', anchorToken);
            const myAnchor = anchor.connect(anchor.withAddress('anchor.proofable.io:443'), anchor.withCredentials(anchorToken));
            // const myAnchor = anchor.connect(anchor.withAddress('anchor.dev.proofable.io:443'));
            const tree = makeTree(data.keyValues, verbose);
            const anchoredProof = await myAnchor.submitProof(tree.getRoot(),
                anchor.submitProofWithAnchorType(anchor.Anchor.Type[anchorChainType]),
                anchor.submitProofWithAwaitConfirmed(true));

            tree.addProof(anchoredProof);
            log.trace('tree', tree);
            if (debug) {
                console.log('=======');
                console.log(tree);
                console.log('=======');
                console.log(tree.getRoot());
                console.log('=======');
                console.log(anchoredProof);
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

function makeTree(inputkeyValues, verbose) {
    if (verbose) {
        log.setLevel('trace');
    }
    const debug = false;
    log.trace('makeTree');
    const builder = new merkle.Builder('sha-256');
    const keyValues = [];
    const keys = Object.keys(inputkeyValues);
    keys.sort().forEach((key) => {
        keyValues.push({
            key,
            value: Buffer.from(inputkeyValues[key])
        });
    });
    builder.addBatch(keyValues);
    const tree = builder.build();
    if (debug) {
        console.log('-----');
        console.log(keys[0]);
        console.log(inputkeyValues[keys[0]]);
        console.log('-----');
        console.log(tree);
        console.log('-----');
    }
    return tree;
}

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

function getBadKeys(proof, tree) {
    const badKeyList = [];
    const proofLeaves = proof.getLeaves();
    const treeLeaves = tree.getLeaves();
    if (proofLeaves.length !== treeLeaves.length) {
        log.info('Mismatch in number of keys when validating data');
        badKeyList.push('different number of keys in proof and validated data');
    } else {
        for (leafId = 0; leafId < proofLeaves.length; leafId++) {
            if (treeLeaves.length > leafId) {
                const proofLeaf = proofLeaves[leafId];
                const treeLeaf = treeLeaves[leafId];
                if (proofLeaf.key !== treeLeaf.key) {
                    log.info('Keys do not match in leaf of tree');
                    badKeyList.push(proofLeaf.key);
                    badKeyList.push(treeLeaf.key);
                } else if (proofLeaf.value !== treeLeaf.value) {
                        badKeyList.push(proofLeaf.key);
                        log.error('Hash mismatch on key ', proofLeaf.key);
                    }
                }
            }
        }

    log.trace(badKeyList);
    return (badKeyList);
}

async function lookupHederaDragonGlass(transactionId, network = 'mainnet', verbose = false) {
    if (verbose) {
        log.setLevel('trace');
    }
    log.trace(`Dragonglass ${network} ${transactionId}`);
    let apiEndPoint = `https://api.dragonglass.me/hedera/api/transactions?query=${transactionId}`;

    let accessKey = dragonGlassAccessKey;
    if (network === 'testnet') {
        apiEndPoint = `https://api-testnet.dragonglass.me/hedera/api/transactions?query=${transactionId}`;
        accessKey = dragonGlassTestNetAccessKey;
    }
    try {
        config = {
            method: 'get',
            url: apiEndPoint,
            headers: {
                'x-api-key': accessKey,
                Accept: 'application/json',
                Host: 'api.dragonglass.me'
            }
        };
        log.trace(config);
        response = await axios(config);
        log.trace('okr', Object.keys(response));

        return (response.data.data[0].memo);
    } catch (error) {
        log.error(error.message);
        log.error(config);
        log.error(response);
        return (false);
    }
}
