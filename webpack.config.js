const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const Dotenv = require('dotenv-webpack');
const path = require('path');

// 环境配置
const ENV = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, `.env.${ENV}`);

module.exports = {
  entry: './src/index.js',
  mode: ENV === 'production' ? 'production' : 'development',
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    host: '0.0.0.0',
    port: 3000,
    hot: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  output: {
    publicPath: process.env.PUBLIC_PATH || 'http://localhost:3000/',
    clean: true,
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new Dotenv({
      path: envPath,
      safe: false,
      systemvars: true,
    }),
    new ModuleFederationPlugin({
      name: 'base',
      filename: 'remoteEntry.js',
      exposes: {
        './Button': './src/components/Button',
        './Header': './src/components/Header',
        './utils': './src/utils',
        './Tracker': './src/sdk/tracker',
        './styles': './src/styles/common.css',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^16.14.0',
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^16.14.0',
        },
      },
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
};
