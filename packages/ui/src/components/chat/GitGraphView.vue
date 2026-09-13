<template>
  <div ref="containerRef" class="git-graph-view" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

interface GraphCommit {
  hash: string;
  parents: string[];
  refs: string[];
  subject: string;
  authorName: string;
  authorEmail: string;
  date: string;
}

const props = defineProps<{ commits: GraphCommit[] }>();
const emit = defineEmits<{ (e: 'select', hash: string): void }>();

const containerRef = ref<HTMLElement | null>(null);
let gitgraph: any = null;
let cleanupFn: (() => void) | null = null;

function parseRefs(refs: string[]): { branches: string[]; tags: string[]; head?: string } {
  const branches: string[] = [];
  const tags: string[] = [];
  let head: string | undefined;
  for (const r of refs) {
    const t = r.trim();
    if (!t) continue;
    if (t.startsWith('tag: ')) tags.push(t.slice(5));
    else if (t === 'HEAD') continue;
    else if (t.startsWith('HEAD -> ')) {
      const b = t.slice(8).trim();
      head = b;
      branches.push(b);
    } else branches.push(t);
  }
  return { branches, tags, head };
}

async function render() {
  if (!containerRef.value || !props.commits.length) return;
  containerRef.value.innerHTML = '';
  const { createGitgraph, TemplateName, Orientation } = await import('@gitgraph/js');
  gitgraph = createGitgraph(containerRef.value, {
    template: TemplateName.Metro,
    orientation: Orientation.VerticalReverse,
    responsive: true,

  });

  const commits = [...props.commits].reverse();
  const branchMap = new Map<string, any>();
  const commitBranch = new Map<string, string>();
  const hashToCommit = new Map(commits.map((c) => [c.hash, c]));

  let mainBranchName = 'main';
  for (const c of commits) {
    const { head, branches } = parseRefs(c.refs);
    if (head) { mainBranchName = head; break; }
    if (branches.length) { mainBranchName = branches[0]; break; }
  }
  const mainBranch = gitgraph.branch(mainBranchName);
  branchMap.set(mainBranchName, mainBranch);

  for (const c of commits) {
    const { branches, tags, head } = parseRefs(c.refs);
    let branchName = commitBranch.get(c.hash);
    if (!branchName) {
      if (head) branchName = head;
      else if (branches.length) branchName = branches[0];
      else if (c.parents.length) branchName = commitBranch.get(c.parents[0]) || mainBranchName;
      else branchName = mainBranchName;
    }

    if (c.parents.length === 2) {
      const mergedHash = c.parents[1];
      const mergedBranch = commitBranch.get(mergedHash) || 'merged';
      let br = branchMap.get(branchName);
      if (!br) { br = gitgraph.branch(branchName); branchMap.set(branchName, br); }
      let otherBr = branchMap.get(mergedBranch);
      if (!otherBr) { otherBr = gitgraph.branch(mergedBranch); branchMap.set(mergedBranch, otherBr); }
      try {
        br.merge(otherBr, {
          hash: c.hash,
          subject: c.subject,
          author: { name: c.authorName, email: c.authorEmail, timestamp: Date.parse(c.date) / 1000 },
        });
      } catch { br.commit({ hash: c.hash, subject: c.subject }); }
      for (const t of tags) try { br.tag(t); } catch {}
    } else {
      let br = branchMap.get(branchName);
      if (!br) { br = gitgraph.branch(branchName); branchMap.set(branchName, br); }
      br.commit({
        hash: c.hash,
        subject: c.subject,
        author: { name: c.authorName, email: c.authorEmail, timestamp: Date.parse(c.date) / 1000 },
      });
      for (const t of tags) try { br.tag(t); } catch {}
    }
    commitBranch.set(c.hash, branchName);
    for (const b of branches) {
      if (!branchMap.has(b) && b !== branchName) {
        const nb = gitgraph.branch(b);
        branchMap.set(b, nb);
      }
    }
  }

  const onClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-commit-hash]');
    if (target) emit('select', target.getAttribute('data-commit-hash') || '');
  };
  containerRef.value.addEventListener('click', onClick);
  cleanupFn = () => containerRef.value?.removeEventListener('click', onClick);
}

onMounted(() => { void render(); });
watch(() => props.commits, () => { void render(); }, { deep: true });
onUnmounted(() => { cleanupFn?.(); });
</script>

<style scoped>
.git-graph-view { width: 100%; overflow-x: auto; }
.git-graph-view :deep(svg) { width: 100%; height: auto; }
</style>