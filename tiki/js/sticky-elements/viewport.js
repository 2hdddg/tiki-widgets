import $ from 'jquery';
import { ScrollEvent } from './util';
import Events from 'events';

function skipDisabled(watcher) {
  return watcher.enabled;
}

class AbstractViewport extends Events.EventEmitter {

  constructor() {
    super();
    this.watchers = [];
  }

  triggerNewScrollEvent() {
    // Create and dispatch a new scroll event artificially
    // Reuse the same browser event
    this.onScroll(this.scrollEvent.e);
  }

  broadcastScrollEvent(scrollEvent) {
    if (scrollEvent.direction === 'up') {
      this.watchers
      .filter(watcher => watcher.enabled)
      .sort((a, b) => b.stackPos - a.stackPos)
      .forEach(watcher => this.triggerOne(watcher, scrollEvent));
    }
    else {
      this.watchers
      .filter(watcher => watcher.enabled)
      .sort((a, b) => a.stackPos - b.stackPos)
      .forEach(watcher => this.triggerOne(watcher, scrollEvent));
    }
  }

  addWatcher(watcher) {
    // console.log('Adding a new watcher: ', watcher);
    if (watcher.stackPos === undefined) {
      watcher.stackPos = this.watchers.length;
    }
    this.watchers.push(watcher);
  }

  removeWatcher(watcher) {
    var index = this.watchers.indexOf(watcher);
    if (index !== -1) {
      this.watchers.splice(index, 1);
    }
  }

  triggerOne(watcher, scrollEvent) {

    if (!scrollEvent.hasMutated(watcher.id)) {
      scrollEvent.addMutated(watcher.id);

      var direction = scrollEvent.direction;
      if (direction == 'up' || direction == 'down') {
        watcher._onVerticalScroll(scrollEvent);
      }
      else {
        watcher._onHorizontalScroll(scrollEvent);
      }
    }
  }

  retriggerScrollEvent() {
    // TODO: ..well, retrigger is only necessary if stackheight has changed

    // Update the scrollHeight and dispatch scrollEvent
    if (this.scrollEvent) {
      this.scrollEvent.stackHeight = this.barStack[0].getBoundingClientRect().height;
      this.broadcastScrollEvent(this.scrollEvent);
    }
  }

  refreshStackHeight(scrollEvent) {
    scrollEvent.stackHeight = this.barStack[0].getBoundingClientRect().height;
  }

  getScrollDirection(scrollLeft, scrollTop) {
    // Get scroll direction
    var direction = null;
    if (this.scrollEvent) {
      var prevScrollLeft = this.scrollEvent.scrollLeft;
      var prevScrollTop = this.scrollEvent.scrollTop;

      if (scrollLeft != prevScrollLeft) {
        direction = scrollLeft > prevScrollLeft ? 'right' : 'left';
      }
      else {
        direction = scrollTop > prevScrollTop ? 'down' : 'up';
      }
    }
    return direction;
  }

  onScroll(e) {
    var scrollEvent = this.createScrollEvent(e);

    // Keep a reference to the most recent scroll event
    this.scrollEvent = scrollEvent;
    this.broadcastScrollEvent(scrollEvent);
  }
}


export class DocumentViewport extends AbstractViewport {
  constructor(config) {
    super();
    this.el = document;
    this.$el = $(document);

    this.groups = {};
    this.stack = $('<div class="stickystack fixed"><div class="bar-stack"></div><div class="inline-stack"></div></div>');
    this.barStack = this.stack.find('>.bar-stack');
    this.inlineStack = this.stack.find('>.inline-stack');
    this.el.body.insertBefore(this.stack[0], this.el.body.firstChild);
    this.scrollEvent = this.createScrollEvent();      // this.$el.on('scroll', _.throttle(this.onScroll, 5).bind(this));
    this.$el.on('scroll', this.onScroll.bind(this));
  }

  createScrollEvent(e) {
    var scrollTop = this.el.body.scrollTop || this.el.documentElement.scrollTop || 0;
    var scrollLeft = this.el.body.scrollLeft || this.el.documentElement.scrollLeft || 0;

    return new ScrollEvent({
      direction: this.getScrollDirection(scrollLeft, scrollTop),
      viewportWidth: $(window).width(), //window.innerWidth,
      viewportHeight: $(window).height(), //window.innerHeight,
      viewportRect: {
          top: 0,
          left: 0
      },
      scrollWidth: this.el.body.scrollWidth,
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      stackHeight: this.barStack[0].getBoundingClientRect().height,
      e: e
    });
  }
}


export class ElementViewport extends AbstractViewport {
  constructor(config) {
    super();
    this.$el = $(config.el);
    this.el = this.$el[0];

    this.groups = {};
    this.stack = $('<div class="stickystack absolute"><div class="bar-stack"></div><div class="inline-stack"></div></div>');
    this.barStack = this.stack.find('>.bar-stack');
    this.inlineStack = this.stack.find('>.inline-stack');
    this.el.insertBefore(this.stack[0], this.el.firstChild);
    this.scrollEvent = this.createScrollEvent();
    this.$el.on('scroll', this.onScroll.bind(this));
  }

  createScrollEvent(e) {
    var scrollTop = this.el.scrollTop;
    var scrollLeft = this.el.scrollLeft;
    var rect = this.el.getBoundingClientRect();


    return new ScrollEvent({
      direction: this.getScrollDirection(scrollLeft, scrollTop),
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      viewportRect: rect,
      scrollWidth: this.el.scrollWidth,
      scrollHeight: this.el.scrollHeight,
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      stackHeight: this.barStack[0].getBoundingClientRect().height,
      e: e
    });
  }

  onScroll(e) {
    this.stack.css('top', this.el.scrollTop);
    // this.stack.css('left', this.el.scrollLeft);
    super.onScroll(e);
  }
}

