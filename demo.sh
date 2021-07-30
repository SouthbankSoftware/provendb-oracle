provendb-oracle install --config=provendb.yaml --createDemoAccount --sysPassword=myLongPassword23 \
     --dropExisting --oracleConnect=local  --provendbPassword=myLongPassword23 --provendbUser=provendb

provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLE 

provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLE --where=CONTRACTID=1

provendb-oracle validate --rowId=AAASHaAAMAAAAlbAAA

unzip AAASHaAAMAAAAlbAAA.provendb

jq <AAASHaAAMAAAAlbAAA.json

provendb-oracle validate --rowId=AAASHaAAMAAAAlbAAA --generateCertificate

open -a Preview AAASHaAAMAAAAlbAAA.pdf

sql provendbdemo/myLongPassword23@local

update contractstable set mytimestamp=sysdate-365 where contractid=1;

provendb-oracle validate --rowId=AAASHaAAMAAAAlbAAA

provendb-oracle monitor --help

provendb-oracle monitor -m 500 --tables=PROVENDBDEMO.CONTRACTSTABLE


insert into contractstable (contractid,metadata,contractdata,mytimestamp) select max(contractid+1),max(metadata),max(contractData),sysdate from contractstable;
insert into contractstable (contractid,metadata,contractdata,mytimestamp) select max(contractid+1),max(metadata),max(contractData),sysdate from contractstable;
commit;

provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLEFBDA --includeScn

update contractstablefbda set mytimestamp=sysdate-365 where contractid=1;
commit;

provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLEFBDA --where=CONTRACTID=1


var request_id number

DECLARE
  TABLENAME VARCHAR2(200);
  COLUMNLIST VARCHAR2(200);
  WHERECLAUSE VARCHAR2(200);
  v_Return NUMBER;
BEGIN
  TABLENAME := 'FABHUMS.EVENT_PAYLOAD';
  COLUMNLIST := 'ID,PAYLOAD';
  WHERECLAUSE := 'ID<14832';

  v_Return := F_ANCHORREQUEST(
    TABLENAME => TABLENAME,
    COLUMNLIST => COLUMNLIST,
    WHERECLAUSE => WHERECLAUSE
  );
  /* Legacy output: 
DBMS_OUTPUT.PUT_LINE('v_Return = ' || v_Return);
*/ 
  :v_Return := v_Return;
--rollback; 
END;

print request_id;

