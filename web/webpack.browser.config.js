const path = require('path');
const webpack = require('webpack');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  entry: {
    main: './src/swissknife-browser-bridge.ts'
  },
  
  mode: 'production',
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'swissknife.[contenthash].js',
    publicPath: './',
    clean: true
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    plugins: [new TsconfigPathsPlugin({ configFile: './tsconfig.web.json' })],
    fallback: {
      "fs": false,
      "path": require.resolve("path-browserify"),
      "url": require.resolve("url/"),
      "buffer": require.resolve("buffer/"),
      "process": require.resolve("process/browser"),
      "util": require.resolve("util/"),
      "stream": require.resolve("stream-browserify"),
      "crypto": require.resolve("crypto-browserify"),
      "events": require.resolve("events/"),
      "os": require.resolve("os-browserify/browser"),
      "child_process": false,
      "net": false,
      "tls": false,
      "http": require.resolve("stream-http"),
      "https": require.resolve("https-browserify"),
      "zlib": require.resolve("browserify-zlib"),
      "vm": require.resolve("vm-browserify"),
      "assert": require.resolve("assert/"),
      "constants": require.resolve("constants-browserify")
    }
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.web.json')
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },

  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
      'global': 'globalThis'
    })
  ],

  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  }
};
