
set long 30000
var request_id NUMBER
var proof_id char
var proof clob

BEGIN
  :request_id := PROVENDB.PROVENDBORACLE.FANCHORREQUEST(
    TABLENAME => 'FABHUMS.EVENT_PAYLOAD',
    COLUMNLIST => 'PAYLOAD,CREATED_DATE',
    WHERECLAUSE => 'ID BETWEEN 0 and 14850',
    KEYCOLUMN => 'ID'
  );
END;
/
print request_id; 

SELECT * FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id; 

begin
SELECT proofId into :proof_id FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id;
select proof into :proof from provendb.provendbcontrol where proofid=:proof_id;
end;
/
print proof_id
print proof

BEGIN
  :request_id := PROVENDB.PROVENDBORACLE.FVALIDATEREQUEST(
    proofid => :proof_id
  );
END;
/

SELECT * FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id; 
 
UPDATE fabhums.event_payload 
   SET CREATED_DATE=SYSDATE
WHERE ID=14850;

UPDATE fabhums.event_payload 
   SET visible=visible*-1
WHERE ID=14847;

COMMIT;

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
        id = 14850;

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


BEGIN
  :request_id := PROVENDB.PROVENDBORACLE.FVALIDATEREQUEST(
    proofid => :proof_id
  );
END;
/
 
SELECT * FROM PROVENDB.PROVENDBREQUESTS WHERE ID=:request_id; 






BEGIN
  :request_id := PROVENDB.PROVENDBORACLE.FVALIDATEREQUEST(
    proofid => :proof_id
  );
END;
/