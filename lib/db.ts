import mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// ORM 없음. 쿼리는 직접 쓰고, 타입은 lib/types.ts 한 곳에서 관리한다.
// 캐스팅을 여기 한 파일에 몰아둬야 스키마가 바뀔 때 찾을 곳이 명확하다.

/** SQL 바인딩에 넣을 수 있는 값. JSON 컬럼은 JSON.stringify 해서 문자열로 넘긴다 */
export type SqlParam = string | number | boolean | Date | null;

declare global {
  // 개발 중 HMR로 모듈이 다시 평가돼도 풀이 새로 생기지 않게 한다
  var __handariPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL이 없습니다. .env.local을 확인하고, SSH 터널이 열려 있는지 보세요:\n' +
        '  ssh -L 13306:tium-mysql.cjw20gkywty8.ap-northeast-2.rds.amazonaws.com:3306 -N tium',
    );
  }

  return mysql.createPool({
    uri: url,
    connectionLimit: 5,
    waitForConnections: true,
    // DATETIME 컬럼을 UTC로 읽고 쓴다. 표시할 때만 KST로 바꾼다.
    timezone: 'Z',
    // BIGINT를 string이 아니라 number로 받는다. id가 2^53을 넘을 일은 없다.
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: false,
    charset: 'utf8mb4_0900_ai_ci',
  });
}

function withUtcSession(p: mysql.Pool): mysql.Pool {
  // RDS 서버 타임존이 Asia/Seoul이라 NOW()가 KST를 준다.
  // 위 timezone:'Z'는 JS Date 변환에만 영향을 주므로 세션 타임존도 UTC로 맞춰야
  // NOW()/CURRENT_TIMESTAMP 기본값과 읽기가 9시간 어긋나지 않는다.
  p.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return p;
}

export const pool: mysql.Pool = global.__handariPool ?? withUtcSession(createPool());
if (process.env.NODE_ENV !== 'production') global.__handariPool = pool;

/** SELECT 전용. 호출부에서 행 타입을 명시한다 — query<ProfileRow>(...) */
export async function query<T>(sql: string, params?: SqlParam[]): Promise<T[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows as T[];
}

/** 한 행만 기대할 때. 없으면 null */
export async function queryOne<T>(sql: string, params?: SqlParam[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT / UPDATE / DELETE. affectedRows와 insertId를 준다 */
export async function execute(sql: string, params?: SqlParam[]): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

/**
 * 트랜잭션. 링크 사용 처리처럼 경쟁이 있는 곳에서 쓴다.
 *
 *   await transaction(async (tx) => {
 *     const r = await tx.execute('UPDATE room_invite SET used_at=NOW() WHERE token=? AND used_at IS NULL', [t]);
 *     if (r.affectedRows !== 1) throw new Error('이미 사용된 링크');
 *     ...
 *   });
 */
export async function transaction<T>(
  fn: (tx: {
    query: <R>(sql: string, params?: SqlParam[]) => Promise<R[]>;
    queryOne: <R>(sql: string, params?: SqlParam[]) => Promise<R | null>;
    execute: (sql: string, params?: SqlParam[]) => Promise<ResultSetHeader>;
  }) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async <R>(sql: string, params?: SqlParam[]): Promise<R[]> => {
        const [rows] = await conn.execute<RowDataPacket[]>(sql, params);
        return rows as R[];
      },
      queryOne: async <R>(sql: string, params?: SqlParam[]): Promise<R | null> => {
        const [rows] = await conn.execute<RowDataPacket[]>(sql, params);
        return (rows as R[])[0] ?? null;
      },
      execute: async (sql: string, params?: SqlParam[]): Promise<ResultSetHeader> => {
        const [result] = await conn.execute<ResultSetHeader>(sql, params);
        return result;
      },
    };
    const out = await fn(tx);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
