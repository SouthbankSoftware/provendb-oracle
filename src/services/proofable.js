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
const tmp = require('tmp');
const {
    merkle,
    anchor
} = require('provendb-sdk-node');

const debug = false;

let proofableClient;


module.exports = {
    // Directly access the proofable client for functions using proofable APIs that fall under the Oracle umbrella.
    getProofableClient: async (config, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        if (proofableClient) {
            return proofableClient;
        }
        await this.connectToProofable(config);
        return proofableClient;
    },
    // Validate data against an existing trie
    validateData: async (trie, keyvalues, outputFile, verbose) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const newSortedData = await proofable.sortKeyValues(proofable.dataToKeyValues(
            keyvalues
        ));
        const validatedProof = await proofableClient.verifyTrieWithSortedKeyValues(trie,
            newSortedData);
        if (validatedProof.keyValues.total !== validatedProof.keyValues.passed) {
            log.error('Proof not validated!');
        } else {
            log.info('All keys validated');
        }
        if (outputFile) {
            fs.writeFileSync(outputFile, JSON.stringify(validatedProof));
            log.trace('Proof written to ', outputFile);
        }
        return (validatedProof);
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

    // Take raw trie data and import it into a proper trie object
    parseTrie: async (trieData) => {
        const tmpFile = tmp.fileSync();
        const trieFileName = tmpFile.name;
        await fs.writeFileSync(trieFileName, trieData, {
            encoding: 'base64',
        });
        const trie = await proofableClient.importTrie('', trieFileName);
        return trie;
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
        const parsedProof = merkle.importTree({ algorithm: proof.algorithm, data: proof.layers, proofs: proof.proofs });
        log.trace('parsed Proof leaves ', parsedProof.getLeaves());
        return (parsedProof);
    },
    // Validate/Create a row proof for a specific row using a pre-existing trie
    // TODO: Ask Guan to give me a way of generating these in batches
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
