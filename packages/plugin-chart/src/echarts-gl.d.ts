// `echarts-gl` ships no type declarations. It is imported only for its
// side effect (registering the WebGL renderer + 3D chart types on echarts),
// so an ambient `any` module is sufficient here.
declare module "echarts-gl"
