/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */

const {
    promisify
} = require('util');
const exec = promisify(require('child_process').exec);

describe('provendb-oracle Anchor tests', () => {
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
        const output = await provendbOracle('history --config=testConfig.yaml --tables=PROVENDBTESTDEMO.CONTRACTSTABLE');

        expect(output).toEqual(expect.stringMatching('Table:  PROVENDBTESTDEMO.CONTRACTSTABLE'));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
        console.log(lines.length);
        expect(lines.length > 5).toBeTruthy();
    });

    test('Rowid history', async () => {
        jest.setTimeout(120000);
        let output = await provendbOracle('history --config=testConfig.yaml --tables=PROVENDBTESTDEMO.CONTRACTSTABLE');

        expect(output).toEqual(expect.stringMatching('Table:  PROVENDBTESTDEMO.CONTRACTSTABLE'));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);

        expect(lines.length > 5).toBeTruthy();

        const lastLine = lines[lines.length - 2];
        // expect(lastLine).toEqual(expect.stringMatching('Rowid'));
        const rowid = lastLine.match(/^(\S*)(.*)/)[1];
        expect(rowid.length).toEqual(18);
        output = await provendbOracle(`history --config=testConfig.yaml --rowid=${rowid}`);
        expect(output).toEqual(expect.stringMatching('Rowid'));
        expect(output).toEqual(expect.stringMatching(rowid));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
        expect(output).not.toEqual(expect.stringMatching('No proofs'));
    });
});

async function provendbOracle(args) {
    const input = 'provendb-oracle ' + args + ' 2>&1|cut -c -1000';
    console.log(input);
    let output;
    let cmdout;
    try {
        cmdout = await exec(input);
        output = cmdout.stdout;
    } catch (error) {
        console.log(error.stack);
    }
    return output;
}
