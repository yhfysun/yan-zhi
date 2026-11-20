export function countConversationsInSpaceTree(
  spaceId: string,
  conversationsBySpace: Record<string, readonly unknown[]>,
  childSpacesOf: (parentId: string) => readonly string[],
  visited = new Set<string>(),
): number {
  if (visited.has(spaceId)) return 0;
  visited.add(spaceId);
  const direct = conversationsBySpace[spaceId]?.length || 0;
  return childSpacesOf(spaceId).reduce(
    (total, childId) => total + countConversationsInSpaceTree(
      childId,
      conversationsBySpace,
      childSpacesOf,
      visited,
    ),
    direct,
  );
}
