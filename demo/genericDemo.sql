/*
PROVENDBDEMO demo script.

Assumes that the CONTRACTSTABLEtable exists in the PROVENDBDEMO account.

Install the PROVENDB account as follows (replace oracleConnect and sysPassword with your values at least):
 
 provendb-oracle install --config=provendb.yaml --createDemoAccount --sysPassword=myLongPassword23 --dropExisting --oracleConnect=local  --provendbPassword=myLongPassword23 --provendbUser=provendb

Then from that directory, run in monitoring mode 

  provendb-oracle monitor --monitorRequests

The commands below are run from the FUBHUMS account 

*/


rem Display options and bind variables 
set long 30000
var request_id NUMBER
var proof_id char
var proof clob
set pages 10000

REM
REM Create a new request to anchor data 
REM 

BEGIN
  :request_id :=  PROVENDBORACLE.FANCHORREQUEST(
    TABLENAME => 'PROVENDBDEMO.CONTRACTSTABLE',
    COLUMNLIST => 'CONTRACTDATA,METADATA',
    WHERECLAUSE => 'CONTRACTID BETWEEN 0 and 100',
    KEYCOLUMN => 'CONTRACTID'
  );
END;
/
print request_id; 


REM check the status of the request table until the request completes
SELECT * FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id; 

REM
REM Get the proofid and the proof into bind variables 
REM
BEGIN
  SELECT proofId into :proof_id FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id;
  SELECT proof into :proof from provendb.provendbcontrol where proofid=:proof_id;
END;
/
print proof_id
print proof


REM 
REM Validate the proof we just created 
REM  
BEGIN
  :request_id :=  PROVENDBORACLE.FVALIDATEREQUEST(
    proofid => :proof_id
  );
END;
/

REM check the status of the request table until the request completes
SELECT * FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id; 
 
/*
  Do some tampering
  14850: change create date - not OK 
  14847: change VISIBLE column - this is OK, b/c that column is not in the proof 
*/

UPDATE provendbdemo.contractstable
   SET METADATA='{"info":"this is tampered"}'
WHERE CONTRACTID=50;

UPDATE provendbdemo.contractstable
   SET mytimestamp=sysdate
WHERE CONTRACTID=49;

COMMIT;

/* 
  Manipulate the JSON document in the CONTRACTDATA COLUMN
  This should invalidate id 14849
*/

REM revalidate
BEGIN
  :request_id := PROVENDBORACLE.FVALIDATEREQUEST(
    proofid => :proof_id
  );
END;
/

rem check table until validate completes - note errors in the MESSAGES
SELECT * FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id; 

 