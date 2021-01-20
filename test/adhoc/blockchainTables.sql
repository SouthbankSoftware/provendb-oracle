CREATE BLOCKCHAIN TABLE contractsBCTable 
   (
      contractId   NUMBER PRIMARY KEY,
      metaData     VARCHAR2(4000)
        CHECK (metaData IS JSON),
      contractData VARCHAR2(4000) NOT NULL,
      mytimestamp TIMESTAMP)
                     NO DROP UNTIL 31 DAYS IDLE
                     NO DELETE LOCKED
                     HASHING USING "SHA2_512" VERSION "v1";

 ALTER table contractsTableFBDA flashback archive provendb;

CREATE SEQUENCE contract_seq ;

CREATE OR REPLACE PROCEDURE populatecontractsBCTable(n NUMBER) IS
                    counter INTEGER:=0;
                  BEGIN
                    WHILE counter < n LOOP
                      INSERT INTO contractsBCTable(contractId,metaData,contractData,mytimestamp)
                      values( contract_seq.nextval,'{"name":"A Name","Date":"A Date"}','jdfksljfdskfsdioweljdslfsdjlewowefsdfjl',sysdate);
                      counter:=counter+1;
                    END LOOP;
                    COMMIT;
                  END; 
/

begin
  populatecontractsBCTable(1000); end;
/
show errors;

SELECT contractid,ORABCTAB_CHAIN_ID$ "Chain ID", ORABCTAB_SEQ_NUM$ "Seq Num",
               to_char(ORABCTAB_CREATION_TIME$,'dd-Mon-YYYY hh-mi') "Chain date",
               ORABCTAB_USER_NUMBER$ "User Num", ORABCTAB_HASH$ "Chain HASH"  
        FROM   contractsBCTable  

set serveroutput on ;

DECLARE
  verify_rows NUMBER;
BEGIN
        DBMS_BLOCKCHAIN_TABLE.VERIFY_ROWS('GUY','CONTRACTSBCTABLE', 
        NULL, NULL, NULL, NULL, verify_rows);
        dbms_output.put_line(verify_rows||' rows verified');
END;
/