export function onRequest(context) {
  const target = new URL('/night', context.request.url);
  return Response.redirect(target.toString(), 302);
}
