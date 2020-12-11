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
        const newSortedData = await proofable.sortKeyValues(proofable.dataToKeyValues(
            keyvalues));
        const validatedProof = await proofableClient.verifyTrieWithSortedKeyValues(trie,
            newSortedData);
        if (validatedProof.total !== validatedProof.passed) {
            log.error('Proof not validated!');
        } else {
            log.info('All keys validated');
        }
        if (outputFile) {
            fs.writeFileSync(outputFile, JSON.stringify(validatedProof));
            log.info('Proof written to ', outputFile);
        }
        return (validatedProof);
    },
    // TODO: Create a demo script for p4o

    // Anchor data to a blockchain - create a trie and anchor that trie
    anchorData: async (data, anchorChainType) => {
        log.info('--> Anchoring data to ', anchorChainType);
        log.info(Object.keys(data.keyValues).length, ' keys');
        const inputData = await proofable.dataToKeyValues(data.keyValues);
        // log.trace(inputData);
        const trie = await proofableClient.createTrieFromKeyValues(inputData);
        // log.trace(trie);
        // await new Promise((resolve) => setTimeout(resolve, 2000));
        const anchoredTrie = await proofableClient.anchorTrie(
            trie,
            proofable.Anchor.Type[anchorChainType],
        );
        log.trace('anchoredTrie->', anchoredTrie);
        return anchoredTrie;
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
        log.info('Connecting to Proofable');

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

    // Validate/Create a row proof for a specific row using a pre-existing trie
    // TODO: Ask Guan to give me a way of generating these in batches
    generateRowProof: async (rowData, trie, proofId, proofFile, dotFile, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const proofableKey = proofable.Key.from(rowData.key.toString());
        const proofableKeyValuesFilter = proofable.KeyValuesFilter.from([proofableKey]);
        const dataValues = {};
        dataValues[rowData.key] = rowData.hash;
        const sortedValues = await proofable.sortKeyValues(proofable.dataToKeyValues(dataValues));

        log.trace('creating key values proof');
        log.trace(
            'args ',
            trie.getId(),
            ' , ',
            proofId,
            ' , ',
            proofableKeyValuesFilter,
            ' , ',
            proofFile,
        );
        try {
            // TODO: Ask Guan to return dot file 
            await proofableClient.createKeyValuesProof(
                trie.getId(),
                proofId,
                proofableKeyValuesFilter,
                proofFile,
            );
        } catch (error) {
            log.error(error.stack);
        }

        log.trace('verifying proof to ', proofFile, ' ', dotFile);
        const docProof = await proofableClient.verifyKeyValuesProofWithSortedKeyValues(
            proofFile,
            sortedValues,
            dotFile,
        );
        log.trace(docProof);
        return docProof;
    },
};