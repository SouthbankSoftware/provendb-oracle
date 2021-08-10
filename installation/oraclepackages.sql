CREATE OR REPLACE 
PACKAGE PROVENDBORACLE IS 
    FUNCTION fanchorrequest (
        tablename    VARCHAR2,
        columnlist   VARCHAR2 := '*',
        whereclause  VARCHAR2 := NULL,
        keyColumn    VARCHAR2 := 'ROWID'
    ) RETURN provendbrequests.id%TYPE;
 
END ;
/

CREATE OR REPLACE PACKAGE BODY provendboracle AS 
    FUNCTION fanchorrequest (
        tablename    VARCHAR2,
        columnlist   VARCHAR2 := '*',
        whereclause  VARCHAR2 := NULL,
        keyColumn    VARCHAR2 := 'ROWID'
    ) RETURN provendbrequests.id%TYPE IS
        l_id    provendbrequests.id%TYPE;
        l_json  VARCHAR2(4000);
    BEGIN
        l_json := '{"table":"'
                  || tablename
                  || '"';
        IF columnlist IS NOT NULL THEN
            l_json := l_json
                      || ',"columns":"'
                      || columnlist
                      || '"';
        END IF;
    
        IF whereclause IS NOT NULL THEN
            l_json := l_json
                      || ',"where":"'
                      || whereclause
                      || '"';
        END IF;
        
        IF keyColumn IS NOT NULL THEN 
                l_json := l_json
                      || ',"keyColumn":"'
                      || keyColumn
                      || '"';
        END IF;
    
        l_json := l_json || '}';
        INSERT INTO provendbrequests ( requestjson ) VALUES ( l_json ) RETURNING id INTO l_id;
    
        COMMIT;
        RETURN ( l_id );
    END;
END; 