import { describe, it, expect } from 'vitest';
import { app } from '../app.js';

// 전체 앱의 라우트 등록 인벤토리(메서드·경로·등록 순서·핸들러 체인 길이)를 스냅샷으로 고정한다.
// 갓파일 분해(예: taghere.ts → 서브라우터) 시 유효 디스패치 순서가 보존됨을 기계적으로 증명하는 게이트.
// '/' 마운트(fast_slash) 라우터는 디스패치에 투명하므로 평탄화 — 분해 전후 스냅샷이 동일해야 한다.
function flatten(stack: unknown[], depth: number): string[] {
  const out: string[] = [];
  const indent = '  '.repeat(depth);
  for (const l of stack as Array<Record<string, any>>) {
    if (l.route) {
      const methods = Object.keys(l.route.methods)
        .map((m) => m.toUpperCase())
        .sort()
        .join('|');
      out.push(`${indent}ROUTE ${methods} ${l.route.path} handlers=${l.route.stack.length}`);
    } else if (l.name === 'router' && l.handle?.stack) {
      if (l.regexp?.fast_slash) {
        out.push(...flatten(l.handle.stack, depth));
      } else {
        out.push(`${indent}MOUNT ${l.regexp?.source ?? '?'}`);
        out.push(...flatten(l.handle.stack, depth + 1));
      }
    } else {
      out.push(`${indent}MW ${l.name || '<anonymous>'} ${l.regexp?.source ?? ''}`);
    }
  }
  return out;
}

describe('route inventory', () => {
  it('전체 라우트 등록(메서드·경로·순서·핸들러 수)이 스냅샷과 일치한다', () => {
    const entries = flatten((app as unknown as Record<string, any>)._router.stack, 0);
    expect(entries.join('\n')).toMatchSnapshot();
  });
});
