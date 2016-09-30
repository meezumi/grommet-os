// (C) Copyright 2014-2016 Hewlett Packard Enterprise Development LP

import React, { Component, PropTypes } from 'react';
import Props from '../utils/Props';
import Responsive from '../utils/Responsive';
import Bar from './meter/Bar';
import Spiral from './meter/Spiral';
import Circle from './meter/Circle';
import Arc from './meter/Arc';
import CSSClassnames from '../utils/CSSClassnames';

const CLASS_ROOT = CSSClassnames.METER;

const TYPE_COMPONENT = {
  'bar': Bar,
  'circle': Circle,
  'arc': Arc,
  'spiral': Spiral
};

function getMaxDecimalDigits (series) {
  let maxDigits = 0;
  series.forEach((item) => {
    const currentDigitsGroup = /\.(\d*)$/.exec(item.value.toString());
    if (currentDigitsGroup) {
      const currentDigits = currentDigitsGroup[1].length;
      maxDigits = Math.max(maxDigits, currentDigits);
    }
  });
  return Math.pow(10, maxDigits);
}

export default class Meter extends Component {

  constructor(props, context) {
    super(props, context);

    this._onResponsive = this._onResponsive.bind(this);
    this._initialTimeout = this._initialTimeout.bind(this);
    this._onActivate = this._onActivate.bind(this);

    this.state = this._stateFromProps(props);
    this.state.initial = true;
    this.state.limitMeterSize = false;
  }

  componentDidMount () {
    if (this.props.responsive) {
      this._responsive = Responsive.start(this._onResponsive);
    }

    this._initialTimer = setTimeout(this._initialTimeout, 10);
  }

  componentWillReceiveProps (nextProps) {
    let state = this._stateFromProps(nextProps);
    this.setState(state);
  }

  componentWillUnmount () {
    clearTimeout(this._initialTimer);

    if (this._responsive) {
      this._responsive.stop();
    }
  }

  _initialTimeout () {
    this.setState({
      initial: false,
      activeIndex: this.state.activeIndex
    });
    clearTimeout(this._initialTimer);
  }

  _onResponsive (small) {
    if (small) {
      this.setState({limitMeterSize: true});
    } else {
      this.setState({limitMeterSize: false});
    }
  }

  _onActivate (index) {
    const { activeIndex, onActive } = this.props;
    this.setState({initial: false, activeIndex: activeIndex});
    if (onActive) {
      onActive(index);
    }
  }

  _normalizeSeries (props, thresholds) {
    let series = [];
    if (props.series) {
      series = props.series;
    } else if (props.value || props.value === 0) {
      series = [
        {value: props.value}
      ];
      if (props.colorIndex) {
        series[0].colorIndex = props.colorIndex;
      }
    }

    // set color index
    if (series.length === 1 && props.thresholds) {
      const item = series[0];
      if (! item.colorIndex) {
        // see which threshold color index to use
        let cumulative = 0;
        thresholds.some(function (threshold) {
          cumulative += threshold.value;
          if (item.value < cumulative) {
            item.colorIndex = threshold.colorIndex || 'graph-1';
            return true;
          }
          return false;
        });
      }
    } else {
      series.forEach(function (item, index) {
        if (! item.colorIndex) {
          item.colorIndex = `graph-${index + 1}`;
        }
      });
    }

    return series;
  }

  _normalizeThresholds (props, min, max) {
    let thresholds = [];
    if (props.thresholds) {
      // Convert thresholds from absolute values to cummulative,
      // so we can re-use the series drawing code.
      let priorValue = min;
      thresholds.push({ hidden: true });
      for (let i = 0; i < props.thresholds.length; i += 1) {
        const threshold = props.thresholds[i];
        // The value for the prior threshold ends at the beginning of this
        // threshold. Series drawing code expects the end value.
        thresholds[i].value = threshold.value - priorValue;
        thresholds.push({
          colorIndex: threshold.colorIndex
        });
        priorValue = threshold.value;
        if (i === (props.thresholds.length - 1)) {
          thresholds[thresholds.length-1].value = max - priorValue;
        }
      }
    } else if (props.threshold) {
      thresholds = [
        { value: props.threshold, hidden: true },
        {
          value: max - props.threshold,
          colorIndex: 'critical'
        }
      ];
    }
    return thresholds;
  }

  _seriesTotal (series) {
    const maxDecimalDigits = getMaxDecimalDigits(series);
    let total = 0;
    series.forEach((item) => {
      total += item.value * maxDecimalDigits;
    });

    return total / maxDecimalDigits;
  }

  _seriesMax (series) {
    let max = 0;
    series.some(function (item) {
      max = Math.max(max, item.value);
    });
    return max;
  }

  // Generates state based on the provided props.
  _stateFromProps (props) {
    let total;
    if (props.series) {
      total = this._seriesTotal(props.series);
    } else if (props.hasOwnProperty('value')) {
      total = props.value;
    } else {
      total = 0;
    }
    let seriesMax;
    // only care about series max when there are multiple values
    if (props.series && props.series.length > 1) {
      seriesMax = this._seriesMax(props.series);
    }
    // Normalize min and max
    const min = (props.min || 0);
    // Max could be provided in props or come from the total of
    // a multi-value series.
    const max = (props.max ||
      (props.stacked ? Math.max(seriesMax, total || 0, 100) :
        (seriesMax || Math.max(total || 0, 100))));
    // Normalize simple threshold prop to an array, if needed.
    const thresholds = this._normalizeThresholds(props, min, max);
    // Normalize simple value prop to a series, if needed.
    const series = this._normalizeSeries(props, thresholds);

    let state = {
      series: series,
      thresholds: thresholds,
      min: min,
      max: max,
      total: total
    };

    if (props.hasOwnProperty('activeIndex')) {
      state.activeIndex = props.activeIndex;
    } else if (props.hasOwnProperty('active')) {
      state.activeIndex = props.active ? 0 : undefined;
    }

    return state;
  }

  _getActiveFields () {
    const { activeIndex, total, series } = this.state;
    let fields;
    if (undefined === activeIndex) {
      fields = {
        value: total
      };
    } else {
      let active = series[activeIndex];
      if (!active) {
        active = series[0];
      }
      fields = {
        value: active.value,
        onClick: active.onClick
      };
    }
    return fields;
  }

  render () {
    const {
      active, label, size, stacked, tabIndex, type, vertical
    } = this.props;
    const { limitMeterSize, series } = this.state;
    let classes = [CLASS_ROOT];
    classes.push(`${CLASS_ROOT}--${type}`);
    if (vertical) {
      classes.push(`${CLASS_ROOT}--vertical`);
    }
    if (stacked) {
      classes.push(`${CLASS_ROOT}--stacked`);
    }
    if (size) {
      let responsiveSize = size;
      // shrink Meter to medium size if large and up
      if (limitMeterSize && (size === 'large' || size === 'xlarge')) {
        responsiveSize = 'medium';
      }
      classes.push(`${CLASS_ROOT}--${responsiveSize}`);
    }
    if (series.length === 0) {
      classes.push(`${CLASS_ROOT}--loading`);
    } else if (series.length === 1) {
      classes.push(`${CLASS_ROOT}--single`);
    } else {
      classes.push(`${CLASS_ROOT}--count-${series.length}`);
    }
    if (active) {
      classes.push(`${CLASS_ROOT}--active`);
    }
    if (this.props.className) {
      classes.push(this.props.className);
    }

    const restProps = Props.omit(this.props, Object.keys(Meter.propTypes));

    let labelElement;
    if (label) {
      labelElement = <div className={`${CLASS_ROOT}__label`}>{label}</div>;
    }

    let GraphicComponent = TYPE_COMPONENT[this.props.type];
    let graphic = (
      <GraphicComponent
        a11yTitle={this.props.a11yTitle}
        activeIndex={this.state.activeIndex}
        min={this.state.min} max={this.state.max}
        onActivate={this._onActivate}
        series={series}
        stacked={stacked}
        tabIndex={tabIndex}
        thresholds={this.state.thresholds}
        total={this.state.total}
        vertical={vertical} />
    );

    const graphicContainer = (
      <div {...restProps} className={`${CLASS_ROOT}__graphic-container`}>
        {graphic}
      </div>
    );

    return (
      <div className={classes.join(' ')}>
        <div ref={ref => this.activeGraphicRef = ref}
          className={`${CLASS_ROOT}__value-container`}>
          {graphicContainer}
          {labelElement}
        </div>
      </div>
    );
  }

}

Meter.propTypes = {
  active: PropTypes.bool, // when single value
  activeIndex: PropTypes.number, // for series values
  a11yTitle: PropTypes.string,
  colorIndex: PropTypes.string,
  label: PropTypes.node,
  max: PropTypes.number,
  min: PropTypes.number,
  onActive: PropTypes.func,
  series: PropTypes.arrayOf(PropTypes.shape({
    colorIndex: PropTypes.string,
    onClick: PropTypes.func,
    label: PropTypes.string, // only for Spiral
    value: PropTypes.number.isRequired
  })),
  size: PropTypes.oneOf(['xsmall', 'small', 'medium', 'large', 'xlarge']),
  stacked: PropTypes.bool,
  tabIndex: PropTypes.string,
  threshold: PropTypes.number,
  thresholds: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.number.isRequired,
    colorIndex: PropTypes.string
  })),
  type: PropTypes.oneOf(['bar', 'arc', 'circle', 'spiral']),
  value: PropTypes.number,
  vertical: PropTypes.bool,
  responsive: PropTypes.bool
};

Meter.defaultProps = {
  type: 'bar'
};

Meter.contextTypes = {
  intl: PropTypes.object
};
