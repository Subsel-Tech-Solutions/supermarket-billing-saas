module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const sourceMapLoaderRule = webpackConfig.module.rules.find(
        (rule) =>
          rule.enforce === "pre" &&
          typeof rule.loader === "string" &&
          rule.loader.includes("source-map-loader"),
      );

      if (sourceMapLoaderRule) {
        sourceMapLoaderRule.exclude = [].concat(
          sourceMapLoaderRule.exclude || [],
          /[\\/]node_modules[\\/]html5-qrcode[\\/]/,
        );
      }

      return webpackConfig;
    },
  },
};
