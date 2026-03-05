import React from 'react'; // base 模块使用本地的 react
import '../styles/common.css';

const Button = ({ children, onClick, type = 'primary', disabled = false }) => {
  return (
    <button
      className={`common-button common-button-${type}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
