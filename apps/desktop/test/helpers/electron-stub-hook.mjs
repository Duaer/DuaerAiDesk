const stub = new URL("./electron-stub.mjs", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === "electron") {
    return { url: stub.href, shortCircuit: true };
  }
  return next(specifier, context);
}
