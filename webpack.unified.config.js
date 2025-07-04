const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isDevelopment = !isProduction;

  return {
    entry: {
      // Single entry point - unified application
      main: './web/src/unified-main.ts'
    },

    mode: argv.mode || 'development',

    output: {
      path: path.resolve(__dirname, 'web/dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      publicPath: './',
      clean: true
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      fallback: {
        "fs": false,
        "path": require.resolve("path-browserify"),
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "util": require.resolve("util"),
        "buffer": require.resolve("buffer"),
        "process": require.resolve("process/browser"),
        "os": require.resolve("os-browserify/browser")
      }
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
          type: 'asset/resource'
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/,
          type: 'asset/resource'
        }
      ]
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: './web/templates/unified.html',
        filename: 'index.html',
        inject: 'body',
        minify: isProduction
      }),
      
      new CopyWebpackPlugin({
        patterns: [
          { from: 'web/assets', to: 'assets' },
          { from: 'web/css', to: 'css' }
        ]
      })
    ],

    devServer: {
      static: {
        directory: path.join(__dirname, 'web/dist'),
      },
      compress: true,
      port: 8000,
      open: true,
      hot: true,
      historyApiFallback: true
    },

    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          stlite: {
            test: /stlite/,
            name: 'stlite',
            chunks: 'all',
          }
        }
      }
    },

    devtool: isDevelopment ? 'source-map' : false
  };
};
