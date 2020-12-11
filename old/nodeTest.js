

const oracledb = require('oracledb');

async function run() {
 let connection;

 try {
    connection = await oracledb.getConnection({
     user: 'guy',
     password: 'myLongPassword23',
     connectString: 'oracledb'
   });
   const result = await connection.execute('select sysdate from dual');
   console.log(result.rows[0]);
 } catch (err) {
   console.error(err);
 } finally {
   if (connection) {
     try {
    await connection.close();
     } catch (err) {
    console.error(err);
     }
   }
 }
}

run();
