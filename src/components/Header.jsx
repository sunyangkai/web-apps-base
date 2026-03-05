import React from 'react'; // base 模块使用本地的 react
import '../styles/common.css';

const Header = ({ title, subtitle }) => {
  return (
    <header className="common-header">
      <h1>{title}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
    </header>
  );
};

export default Header;
