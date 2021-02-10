export const disableExecFunctions = () => {
  const nop = () => {};
  const anyDoc = document as any;
  anyDoc.execCommand = nop;
  anyDoc.execScript = nop;
};
