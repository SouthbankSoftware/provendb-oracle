/*
FABHUMS demo script.

Assumes that the EVENT_PAYLOAD table exists in the FABHUMS account.

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
    TABLENAME => 'FABHUMS.EVENT_PAYLOAD',
    COLUMNLIST => 'PAYLOAD,CREATED_DATE',
    WHERECLAUSE => 'ID BETWEEN 0 and 14850',
    KEYCOLUMN => 'ID'
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

UPDATE fabhums.event_payload 
   SET CREATED_DATE=SYSDATE
WHERE ID=14850;

UPDATE fabhums.event_payload 
   SET visible=visible*-1
WHERE ID=14847;

COMMIT;

/* 
  Manipulate the JSON document in the PAYLOAD COLUMN
  This should invalidate id 14849
  */

DECLARE
    v_jsoncol      CLOB;
    v_json_obj     json_object_t;
    v_new_jsoncol  CLOB;
BEGIN
    SELECT
        payload
    INTO v_jsoncol
    FROM
        fabhums.event_payload
    WHERE
        id = 14849;

    v_json_obj := TREAT(json_element_t.parse(v_jsoncol) AS json_object_t);
    v_json_obj.put('newPLSQLData', dbms_random.value());
    v_new_jsoncol := v_json_obj.to_clob;
    
    UPDATE fabhums.event_payload
    SET
        payload = v_new_jsoncol 
    WHERE
        id = 14849;
    COMMIT;     

END;
/



REM revalidate
BEGIN
  :request_id := PROVENDBORACLE.FVALIDATEREQUEST(
    proofid => :proof_id
  );
END;
/

rem check table until validate completes - note errors in the MESSAGES
SELECT * FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id; 

 