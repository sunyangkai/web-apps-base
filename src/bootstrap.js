import React from 'react';
import ReactDOM from 'react-dom';
import './styles/common.css';
import Button from './components/Button';
import Header from './components/Header';

const App = () => {
  return (
    <div className="container">
      <Header title="Base Module - Shared Components" />
      <div className="content">
        <h2>This is the base module</h2>
        <p>It provides shared components, utilities, and styles to other micro-frontends.</p>
        <Button onClick={() => alert('Base Button Clicked!')}>
          Shared Button Component
        </Button>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
