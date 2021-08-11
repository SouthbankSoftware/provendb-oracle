/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */


const oracledb = require('oracledb');
const {
    provendbOracle, getParameters
} = require('./testCommon');

const parameters = getParameters();
const provendbUser = parameters.config.oracleConnection.user.toUpperCase();
const demoSchema = provendbUser + 'DEMO';
const anchorType = parameters.anchorType;



describe('provendb-oracle Monitor tests', () => {
    beforeAll(() => { });

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => { });

    test('Test help', async () => {
        const output = await provendbOracle('monitor --help');
        expect(output).toEqual(expect.stringMatching('Monitor the database for changes'));
    });
    test('Test monitor tables no changes', async () => {
        jest.setTimeout(240000);
        const monitorCmd = `monitor --config=testConfig.yaml -i 20 -m 90 --tables=${demoSchema}.CONTRACTSTABLE`;
        const output = await provendbOracle(monitorCmd);
        expect(output).toEqual(expect.stringMatching('Anchoring data to HEDERA'));
        expect(output).toEqual(expect.stringMatching('Anchored to https'));
        expect(output).toEqual(expect.stringMatching('Sleeping for 20 seconds'));
        expect(output).toEqual(expect.stringMatching('100 keys'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
    });

    test('Test monitor DB API table only ', async () => {
        jest.setTimeout(120000);
        const oraConnection = await oracledb.getConnection({
            connectString: parameters.P4O_ORACLE_SERVER,
            user: provendbUser,
            password: 'myLongPassword23'
        });
        const sql = `
        DECLARE
            v_Return NUMBER;
        BEGIN
            v_Return := provendboracle.fanchorrequest(
            TABLENAME => '${demoSchema}.CONTRACTSTABLE' );
     
        END;`;
        console.log(sql);
        const out = await oraConnection.execute(sql);
        console.log(out);
        const monitorCmd = 'monitor --config=testConfig.yaml -i 20 -m 40 --monitorRequests ';
        const output = await provendbOracle(monitorCmd);
        expect(output).toEqual(expect.stringMatching('Anchoring data to HEDERA'));
        expect(output).toEqual(expect.stringMatching('Anchored to https'));
        expect(output).toEqual(expect.stringMatching('Sleeping for 20 seconds'));
        expect(output).toEqual(expect.stringMatching('100 keys'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
    });

    test('Test monitor DB API parameters', async () => {
        jest.setTimeout(120000);
        const oraConnection = await oracledb.getConnection({
            connectString: parameters.P4O_ORACLE_SERVER,
            user: provendbUser,
            password: 'myLongPassword23'
        });
        const sql = `
        DECLARE
            v_Return NUMBER;
        BEGIN
            v_Return :=  provendboracle.fanchorrequest(
            TABLENAME => '${demoSchema}.CONTRACTSTABLE' ,
            WHERECLAUSE => 'CONTRACTID<10',
            COLUMNLIST => 'CONTRACTDATA',
            KEYCOLUMN => 'CONTRACTID' );
     
        END;`;
        console.log(sql);
        const out = await oraConnection.execute(sql);
        console.log(out);
        const monitorCmd = 'monitor --config=testConfig.yaml -i 20 -m 90 --monitorRequests ';
        const output = await provendbOracle(monitorCmd);
        expect(output).toEqual(expect.stringMatching('Anchoring data to HEDERA'));
        expect(output).toEqual(expect.stringMatching('Anchored to https'));
        expect(output).toEqual(expect.stringMatching('Sleeping for 20 seconds'));
        expect(output).toEqual(expect.stringMatching('9 keys'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
    });

    test('Test monitor validate', async () => {
        jest.setTimeout(120000);
        const oraConnection = await oracledb.getConnection({
            connectString: parameters.P4O_ORACLE_SERVER,
            user: provendbUser,
            password: 'myLongPassword23'
        });
        let sql = `select proofid from (
        select proofid,json_value(metadata,'$.includeScn'),
               dense_rank() over (order by start_time desc) as ranking
         from provendbcontrol c
         where table_name='CONTRACTSTABLE'
           and json_value(metadata,'$.includeScn')='false') 
        where ranking=1`;
        console.log(sql);
        const out = await oraConnection.execute(sql);
        console.log(out);
        const proofId = out.rows[0][0];
        sql = `
        DECLARE
            v_Return NUMBER;
        BEGIN
            v_Return :=  PROVENDBORACLE.FVALIDATEREQUEST(
                proofid => '${proofId}'
            );
        END;`;
        console.log(sql);
        await oraConnection.execute(sql);

        const monitorCmd = 'monitor --config=testConfig.yaml -i 20 -m 90 --monitorRequests ';

        const output = await provendbOracle(monitorCmd);
        expect(output).toEqual(expect.stringMatching('PASS: Proof validated with hash'));
        expect(output).toEqual(expect.stringMatching('PASS: blockchain hash matches proof hash'));
        expect(output).toEqual(expect.stringMatching('PASS: data hash matches proof hash'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
    });
});
