/** Stylesheets are imported as text and inlined into the binary. */
declare module "*.css" {
  const content: string;
  export default content;
}
