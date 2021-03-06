/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */



const { monitorSleep } = require('../src/services/oracle');
const {
    provendbOracle, getParameters
} = require('./testCommon');

const parameters = getParameters();
const demoSchema = parameters.config.oracleConnection.user.toUpperCase() + 'DEMO';

describe('provendb-oracle History tests', () => {
    beforeAll(() => {});

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => {});

    test('Test help', async () => {
        const output = await provendbOracle('history --help');
        expect(output).toEqual(expect.stringMatching('Show the rowids and optionally SCNs for which we have anchored proofs'));
    });
    test('table history', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLE`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLE`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);

        expect(lines.length > 5).toBeTruthy();
    });


    test('Rowid history', async () => {
        jest.setTimeout(120000);
        let output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLE`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLE`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);

        expect(lines.length > 5).toBeTruthy();

        const lastLine = lines[lines.length - 2];
        // console.log(lastLine);
        const rowid = lastLine.match(/^(\s*)(\S*)(\s*)/)[2];
        console.log(rowid);
        const escapedRowid = escapeRegex(rowid);
        expect(rowid.length).toEqual(18);
        output = await provendbOracle(`history --config=testConfig.yaml --rowId=${rowid}`);

        const rowidmatch = output.match(rowid);

        expect(output).toEqual(expect.stringMatching('Rowid'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
        expect(output).not.toEqual(expect.stringMatching('No proofs'));
        expect(output).toEqual(expect.stringMatching(escapedRowid));
    });
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
