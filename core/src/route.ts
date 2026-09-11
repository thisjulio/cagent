export function splitRoute(route: string): [string, string] {
  const i = route.indexOf("/");
  return i === -1 ? [route, route] : [route.slice(0, i), route.slice(i + 1)];
}
