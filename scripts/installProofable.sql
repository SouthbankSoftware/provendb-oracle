rem
rem sqlplus /nolog @installProofable
rem

 ACCEPT proofable_password   char  PROMPT 'Enter password for the (new) proofable user:'
 ACCEPT admin_user char prompt 'Enter admin user (eg SYSTEM) :'
 ACCEPT admin_password char prompt 'Enter admin password:' hide
 ACCEPT TNS char PROMPT 'Enter TNSNAMES entry:'
 ACCEPT FBDA char PROMPT 'Enter Flasback Data Archive:'

rem define proofable_password='myLongPassword23'
rem define admin_password='Thx1138Thx1138'
rem define TNS='oracledb'
rem define FBDA='proofable'

 
connect &&admin_user/&&admin_password@&&TNS
DROP USER proofable CASCADE;
DROP USER proofableDemo CASCADE; 

CREATE USER proofable IDENTIFIED BY &&proofable_password ;
GRANT CONNECT, RESOURCE, CREATE SESSION, SELECT_CATALOG_ROLE , UNLIMITED TABLESPACE, CREATE VIEW TO proofable;
GRANT SELECT ANY TABLE TO proofable;
GRANT FLASHBACK ANY TABLE TO proofable;
GRANT execute_catalog_role to proofable;

CREATE USER proofableDemo IDENTIFIED BY &&proofable_password;
GRANT CONNECT, RESOURCE, CREATE SESSION, SELECT_CATALOG_ROLE , UNLIMITED TABLESPACE, CREATE VIEW TO proofableDemo;

GRANT execute_catalog_role  to proofableDemo;
rem CREATE FLASHBACK ARCHIVE proofable TABLESPACE data RETENTION 1 month;

connect proofable/&&proofable_password@&&TNS

DROP TABLE proofablecontrolrowids;
DROP TABLE proofablecontrol;

CREATE TABLE proofablecontrol (
    owner_name   VARCHAR2(128) NOT NULL,
    table_name   VARCHAR2(128) NOT NULL,
    start_time   DATE NOT NULL,
    end_time     DATE NOT NULL,
    start_scn    NUMBER,
    end_scn      NUMBER,
    trieid       VARCHAR2(256),
    trie         CLOB NOT NULL,
    trieType     VARCHAR2(30) NOT NULL,
    whereclause VARCHAR(2000),
    CONSTRAINT table1_pk PRIMARY KEY ( trieid )
        USING INDEX (
            CREATE UNIQUE INDEX table1_pk ON
                proofablecontrol (
                    trieid
                ASC )
        )
    ENABLE
);

 

CREATE INDEX proofablecontrol_i1 ON
    proofablecontrol (
        owner_name,
        table_name,
        start_time,
        end_time
    );

CREATE TABLE proofablecontrolrowids (
    trieid            VARCHAR2(256) NOT NULL,
    rowid_scn   VARCHAR2(128) NOT NULL,
    versions_starttime timestamp not null,
    CONSTRAINT proofablecontrolrowids_pk PRIMARY KEY ( trieid,
                                                       rowid_scn ) ENABLE
);

ALTER TABLE proofablecontrolrowids
    ADD CONSTRAINT proofablecontrolrowids_fk1 FOREIGN KEY ( trieid )
        REFERENCES proofablecontrol ( trieid )
    ENABLE;

CREATE INDEX proofablecontrolrowids_i1 on proofablecontrolrowids(rowid_scn);

 

connect proofableDemo/&&proofable_password@&&TNS

CREATE TABLE contractsTable(
  contractId   NUMBER PRIMARY KEY,
  metaData     VARCHAR2(4000)
     CHECK (metaData IS JSON),
  contractData VARCHAR2(4000) NOT NULL,
  mytimestamp TIMESTAMP
);

CREATE OR REPLACE TRIGGER contractsTable_proofable_trg 
    AFTER INSERT OR UPDATE OR DELETE ON contractsTable
    BEGIN 
      DBMS_ALERT.SIGNAL('provendb_alert','proofable table modified'); 
    END;
/

ALTER table contractsTable flashback archive proofable;

DROP SEQUENCE contract_seq;
CREATE SEQUENCE contract_seq; 

CREATE OR REPLACE PROCEDURE populatecontractsTable(n NUMBER) IS
  counter INTEGER:=0;
BEGIN
  WHILE counter < n LOOP
    INSERT INTO contractsTable(contractId,metaData,contractData,mytimestamp)
    values( contract_seq.nextval,'{"name":"A Name","Date":"A Date"}','jdfksljfdskfsdioweljdslfsdjlewowefsdfjl',sysdate);
    counter:=counter+1;
  END LOOP;
  COMMIT;
END; 
/

BEGIN
  populatecontractsTable(100);
  COMMIT;
END;
/
COMMIT;