/*
 * Encapsulates all the relevant functions for interacting with configuration files.
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
const yaml = require('js-yaml');

const options = {};



module.exports = {
    // Add a table to the config (unimplemented)
    register: async () => {
        const tableNames = options.register;
        if (!('oracleTables' in config)) {
            config.oracleTables = [];
        }

        tableNames.forEach((tableName) => {
            const tableDef = {};
            tableDef[tableName] = {
                name: tableName,
            };
            if (options.registerFilter) {
                tableDef[tableName][filter] = options.registerFilter;
            }
            config.oracleTables.push(tableDef);
            log.trace(tableDef);
        });

        await saveConfig();
    },

    getConfig: async (configPath) => {
        let config;
        if (configPath) {
            log.debug(`Loading config from ${configPath}...`);
            config = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'));
        } else {
            const defaultConfig = './provendb.yaml';
            if (fs.existsSync(defaultConfig)) {
                config = yaml.safeLoad(fs.readFileSync(defaultConfig, 'utf8'));
            } else {
                throw new Error(`No --config specified and cannot file default config ${defaultConfig}`);
            }
        }
        log.trace(`Config loaded: ${JSON.stringify(config)}`);
        return (config);
    },
    // Save current configuration to the configuration file (unimplemented)
    saveConfig: async (fileName, provendbUser, oracleConnection, provendbPassword, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        const freeAnchorKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhbmNob3IiLCJleHAiOjE3ODA5ODE5MzMsImp0aSI6ImFhMW5nbnFtNDVpMHFtNHIxMHZmeGp1ZiIsInN1YiI6InUya3o3ZTc1NnNuajF6NTFid2g1bTZuZyIsInNjb3BlIjoiMCIsInJvbGUiOiJGcmVlIn0.MtooMUPuhCnve1DwJKqXQyh324I2x_9_ASH-xSs3j-0';
        // const freeCVKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJwcm92ZW5kb2NzIiwiZXhwIjoxNzgyODc5MjU3LCJqdGkiOiJhdnd4MXEzeXF4dXFhNmtnZHN5YjE3dW4iLCJzdWIiOiJ1Mmt6N2U3NTZzbmoxejUxYndoNW02bmciLCJzY29wZSI6IjMxIiwicm9sZSI6IkZyZWUifQ.1EsJsmk4Q8B9L7vjlr4mbW2QaPtBE40h64DFOLiYXHU';
        const config = {
            oracleConnection: {
                connectString: oracleConnection,
                user: provendbUser,
                password: provendbPassword
            },
            anchorType: 'HEDERA',
            dbmsAlert: 'TRUE',
            proofable: {
                token: freeAnchorKey,
                endpoint: 'anchor.proofable.io:443'
            }
        };

        const newConfig = yaml.safeDump(config);
        fs.writeFileSync(fileName, newConfig);
        log.info('Wrote new config to ', fileName);
        log.info('This configuration uses a trial key - get your key at https://app.provendb.com/app/dashboard/api-keys');
        log.trace(newConfig);
    },
};