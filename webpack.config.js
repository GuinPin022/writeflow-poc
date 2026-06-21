/* eslint-disable no-undef */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const devCerts = require("office-addin-dev-certs");

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const config = {
    devtool: "source-map",
    entry: {
      polyfill: ["core-js/stable"],
      taskpane: ["./src/taskpane/taskpane.ts", "./src/taskpane/taskpane.html"],
    },
    output: {
      clean: true,
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      // Chemins relatifs : fonctionne en local ET sous un sous-dossier GitHub Pages.
      publicPath: "",
    },
    resolve: {
      extensions: [".ts", ".js", ".html"],
    },
    module: {
      rules: [
        { test: /\.ts$/, exclude: /node_modules/, use: ["ts-loader"] },
        { test: /\.html$/, exclude: /node_modules/, use: "html-loader" },
        { test: /\.css$/, use: ["style-loader", "css-loader"] },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["polyfill", "taskpane"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "manifest.xml", to: "[name][ext]" },
          { from: "assets", to: "assets" },
          // Tableau de bord web statique, deploye sur le meme site GitHub Pages.
          { from: "dashboard.html", to: "[name][ext]" },
          // Scripts d'install testeurs, telechargeables depuis GitHub Pages.
          { from: "installer-writeflow.ps1", to: "[name][ext]" },
          { from: "installer-writeflow-mac.command", to: "[name][ext]" },
        ],
      }),
    ],
    devServer: {
      headers: { "Access-Control-Allow-Origin": "*" },
      port: 3000,
    },
  };

  // Certificat HTTPS local UNIQUEMENT pour le serveur de dev (npm start / dev-server).
  // En build (local ou GitHub Actions), on n'y touche pas -> pas de plantage en CI.
  if (env && env.WEBPACK_SERVE) {
    config.devServer.server = {
      type: "https",
      options: options.https !== undefined ? options.https : await getHttpsOptions(),
    };
  }

  return config;
};
