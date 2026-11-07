// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decide, MOTIVI } from '../../.claude/hooks/guard-git.mjs'

/**
 * Il hook `.claude/hooks/guard-git.mjs` sta fuori da `src/` (lo carica Claude
 * Code, non l'app), ma il test sta qui perché vitest lo conti e la CI lo
 * asserisca in `ATTESO`. Tutti sintetici: nessun git vero, il branch corrente e
 * i file di `-F` arrivano da `ctx`.
 */

type Motivo = keyof typeof MOTIVI | null
const SU_BRANCH = { cwd: '/repo', readFile: () => null, currentBranch: () => 'chore/x' }
const SU_MAIN = { ...SU_BRANCH, currentBranch: () => 'main' }

const verifica = (casi: [string, Motivo][], ctx = SU_BRANCH) =>
  it.each(casi)('%j → %s', (comando, atteso) => {
    expect(decide(comando, ctx)).toBe(atteso === null ? null : MOTIVI[atteso])
  })

describe('gh', () => {
  verifica([
    ['gh pr merge 68', 'merge'],
    ['gh pr merge --merge --delete-branch 68', 'merge'],
    ['gh api -X PUT repos/o/r/pulls/68/merge', 'merge'],
    ['gh pr create --body-file f.md', null],
    ['gh pr list --limit 1', null],
  ])
})

describe('git push forzato', () => {
  verifica([
    ['git push --force', 'force'],
    ['git push -f origin chore/x', 'force'],
    ['git push --force-with-lease', 'force'],
    ['git push --force-with-lease=chore/x:abc123 origin chore/x', 'force'],
    ['git push -uf origin chore/x', 'force'],
    ['git push origin +chore/x', 'force'],
    ['git push origin chore/hook-guard-git', null],
    ['git push -u origin chore/hook-guard-git', null],
  ])
})

describe('git push su main', () => {
  verifica([
    ['git push origin main', 'main'],
    ['git push origin HEAD:main', 'main'],
    ['git push origin refs/heads/main', 'main'],
    ['git push origin :main', 'main'],
    ['git push origin --delete main', 'main'],
    ['git push --all origin', 'main'],
    ['git push --mirror', 'main'],
    ['git push origin main-fix', null],
    ['git push --tags', null],
    ['git push', null],
  ])
  describe('con il branch corrente main', () => {
    verifica(
      [
        ['git push', 'main'],
        ['git push origin HEAD', 'main'],
        ['git push -u origin', 'main'],
      ],
      SU_MAIN
    )
  })
})

describe('git add', () => {
  verifica([
    ['git add -A', 'add'],
    ['git add --all', 'add'],
    ['git add .', 'add'],
    ['git add -u', 'add'],
    ['git add --update', 'add'],
    ['git add "."', 'add'],
    ['git add -vA', 'add'],
    ['git stage -A', 'add'],
    ['git add :/', 'add'],
    ['git add -- .', 'add'],
    ['git add ./src/file.ts', null],
    ['git add src/x.ts', null],
    ['git add -p src/x.ts', null],
  ])
})

describe('git commit', () => {
  verifica([
    ['git commit -m "x" -m "Co-Authored-By: C <c@x>"', 'trailer'],
    ["git commit -m \"$(cat <<'EOF'\nfeat: x\n\n1) punto\n\nCo-Authored-By: C <c@x>\nEOF\n)\"", 'trailer'],
    ["git commit -m \"$(cat <<'EOF'\nfeat: x\n\nGenerated with [Claude Code](https://claude.com/claude-code)\nEOF\n)\"", 'trailer'],
    ["git commit -F - <<'EOF'\nfeat: x\n\nco-authored-by: c\nEOF", 'trailer'],
    ['git commit --trailer "Reviewed-by: x" -m x', 'trailer'],
    ['git commit -m "feat: x" --trailer=Co-authored-by:x', 'trailer'],
    ['git commit -am "fix: x"', 'add'],
    ['git commit --all -m x', 'add'],
    ['git commit -m "chore: hook che blocca i trailer Co-Authored-By"', null],
    ['git commit --amend --no-edit', null],
    ['git commit -m "fix(scope): x"', null],
    ["git commit -m \"$(cat <<'EOF'\nfix: x\n\nIl body dice perché.\nEOF\n)\"", null],
  ])

  describe('messaggio da file (-F / --file)', () => {
    const conFile = (contenuti: Record<string, string>) => ({
      ...SU_BRANCH,
      readFile: (p: string) => contenuti[p] ?? null,
    })
    it('nega se il file contiene il trailer', () => {
      const ctx = conFile({ '/repo/msg.txt': 'feat: x\n\nCo-Authored-By: c' })
      expect(decide('git commit -F msg.txt', ctx)).toBe(MOTIVI.trailer)
    })
    it('passa se il file è pulito', () => {
      const ctx = conFile({ '/repo/msg.txt': 'feat: x\n\nIl perché.' })
      expect(decide('git commit -F msg.txt', ctx)).toBeNull()
    })
    it('passa se il file non esiste (ci pensa git)', () => {
      expect(decide('git commit --file=assente.txt', conFile({}))).toBeNull()
    })
    it('risolve il file rispetto a git -C', () => {
      const ctx = conFile({ '/repo/sub/msg.txt': 'x\n\nCo-Authored-By: c' })
      expect(decide('git -C sub commit -F msg.txt', ctx)).toBe(MOTIVI.trailer)
    })
  })
})

describe('segmenti', () => {
  verifica([
    ['npm test && git push -f', 'force'],
    ['git status; git add -A', 'add'],
    ['git log --oneline | head -3 && git add .', 'add'],
    ['git status || git push origin main', 'main'],
    ['(git push -f)', 'force'],
    ['echo "git add -A"', null],
    ["echo 'git push --force' > note.txt", null],
    ['bash -c "git push -f"', 'force'],
    ['echo $(git add -A)', 'add'],
    ['eval "gh pr merge 1"', 'merge'],
    ['echo `git push -f`', 'force'],
    ['git status\ngit add -A', 'add'],
    ['for f in a b; do git add -A; done', 'add'],
    ['cat <<EOF\ngit add -A\nEOF', null],
  ])
})

describe('opzioni globali e maiuscole', () => {
  verifica([
    ['git -C ../x push -f', 'force'],
    ['git -c core.x=y add -A', 'add'],
    ['git --no-pager -C . commit -m x --trailer a=b', 'trailer'],
    ['FOO=1 git push -f', 'force'],
    ['/usr/bin/git push -f', 'force'],
    ['GIT PUSH -f', 'force'],
    ['Git Add -A', 'add'],
    ['git -C "dir con spazi" add src/x.ts', null],
    ['env GIT_TRACE=1 git push --force', 'force'],
  ])
})

describe('comandi neutri', () => {
  verifica([
    ['npm run build', null],
    ['', null],
    ['git status', null],
    ['git log --grep="git add -A"', null],
    ['git push origin chore/x 2>&1 | tail -5', null],
  ])
})

describe('filo: stdin → exit code', () => {
  const SCRIPT = fileURLToPath(new URL('../../.claude/hooks/guard-git.mjs', import.meta.url))
  const lancia = (input: string) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' })
  const bash = (command: string) =>
    JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: '/' })

  it('comando vietato: exit 2 e il motivo su stderr', () => {
    const r = lancia(bash('git add -A'))
    expect([r.status, r.stderr]).toEqual([2, MOTIVI.add + '\n'])
  })
  it('comando permesso: exit 0 muto', () => {
    const r = lancia(bash('git add src/x.ts'))
    expect([r.status, r.stdout, r.stderr]).toEqual([0, '', ''])
  })
  it('tool diverso da Bash: exit 0 muto', () => {
    const r = lancia(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'x' } }))
    expect([r.status, r.stderr]).toEqual([0, ''])
  })
  it('JSON illeggibile: blocca (exit 2), non lascia passare', () => {
    const r = lancia('non è json')
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/^guard-git: errore interno/)
  })
})
