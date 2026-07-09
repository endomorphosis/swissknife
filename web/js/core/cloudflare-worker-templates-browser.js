const TEMPLATES = {
  'ai-inference': 'export default { async fetch() { return new Response("ai-inference ready"); } };',
  compute: 'export default { async fetch() { return new Response("compute ready"); } };',
  'file-processing': 'export default { async fetch() { return new Response("file-processing ready"); } };',
};

export function getWorkerTemplate(name) {
  return TEMPLATES[name] || 'export default { async fetch() { return new Response("worker ready"); } };';
}
