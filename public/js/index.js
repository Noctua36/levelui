websocket(function(socket) {

  //
  // cache some of the frequently referred to DOM elements.
  //
  var $startKey = $('#startKey');
  var $endKey = $('#endKey');
  var $limit = $('#limit');
  var $controls = $('.control');
  var $keyList = $('#keyList');
  var $veryLarge = $('#veryLarge');
  var $selectOne = $('#selectOne');
  var $selectKeys = $('#selectKeys');
  var $noKeys = $('#noKeys');
  var $visualizations = $('#visualizations');

  var keyTemplate = '<option value="{{key}}" title="{{key}}">{{key}}</option>';

  var currentSelection = '';
  var currentDatasource = 'usrdb';

  function request(message) {
    message.dbname = currentDatasource;
    message = JSON.stringify(message);
    socket.write(message);
  }

  function getOpts() {

    var opts = {
      limit: parseInt($limit.val()) || 100,
      reverse: !!$('#reverse:checked').length,
    };

    if ($startKey.val().length > 0) {
      opts.start = $startKey.val();
    }

    if ($endKey.val().length > 0 && $('#range:checked').length) {
      opts.end = $endKey.val();
    }

    return opts;
  }

  function getSelectedKeys() {
    var keys = [];

    $keyList.find('option:selected').each(function(key){
      keys.push(this.value);
    });

    return keys;
  }

  var inputBounce;
  function keyListUpdate() {

    clearTimeout(inputBounce);
    inputBounce = setTimeout(function() {

      request({ 
        request: 'keyListUpdate', 
        value: getOpts()
      });

    }, 16);
  }

  //
  // visualization stuff
  //
  var cache = {};
  var metrics = [];

  var context = cubism.context()
    .serverDelay(0)
    .clientDelay(0)
    .step(1e3)
    .size(960);

  function visualizationUpdate() {

  }

  function addVisualizationMetric(name) {

    cache[name] = [];

    var last;

    var m = context.metric(function(start, stop, step, callback) {

      start = +start, stop = +stop;
      if (isNaN(last)) last = start;

      socket.write(JSON.stringify({ key: name }));
      
      cache[name] = cache[name].slice((start - stop) / step);
      callback(null, cache[name]);
    }, name);

    m.name = name;
    return m;
  }

  function renderVisualization() {
    d3.select("#main").call(function(div) {

      div
        .append("div")
        .attr("class", "axis")
        .call(context.axis().orient("top"));

      div
        .selectAll(".horizon")
          .data(metrics)
        .enter().append("div")
          .attr("class", "horizon")
          .call(context.horizon().extent([-20, 20]).height(125));

      div.append("div")
        .attr("class", "rule")
         .call(context.rule());

    });

    // On mousemove, reposition the chart values to match the rule.
    context.on("focus", function(i) {
      var px = i == null ? null : context.size() - i + "px";
      d3.selectAll(".value").style("right", px);
    });
  }

  //
  // socket stuff
  //
  socket.on('data', function(message) {

    try { message = JSON.parse(message); } catch(ex) {}

    var response = message.response;
    var value = message.value;

    //
    // when a value gets an update
    //
    if (response === 'editorUpdate') {
      if (JSON.stringify(value.value).length < 1e4) {
        $veryLarge.hide();
        editor_json.doc.setValue(JSON.stringify(value.value, 2, 2));
      }
      else {
        $veryLarge.show();
        $veryLarge.unbind('click');
        $veryLarge.on('click', function() {
          editor_json.doc.setValue(JSON.stringify(value.value, 2, 2));
          $veryLarge.hide();
        });
      }
    }

    //
    // when there is an update for the list of keys
    //
    else if (response === 'keyListUpdate') {

      $keyList.empty();

      if (message.value.length > 0) {
        $noKeys.hide();
      }
      else {
        $noKeys.show();
      }

      message.value.forEach(function(key) {
        $keyList.append(keyTemplate.replace(/{{key}}/g, key));
      });

    }

    //
    // general information about the page
    //
    else if (response === 'metaUpdate') {

      if (value.path) {
        $('#pathtodb').text(value.path);
      }
    }

    //
    // tagged keys
    //
    else if (response === 'buildTreeMap') {
      console.log(JSON.stringify(value, 2, 2))
      buildTreeMap(value);
    }

  });

  $('nav.secondary input').on('click', function() {

    //
    // TODO: clean this up
    //
    if(this.id === 'nav-all') {
      currentDatasource = 'usrdb';
      $visualizations.hide();
      keyListUpdate();
    }
    else if (this.id == 'nav-vis') {
      currentDatasource = 'tagdb';
      $visualizations.show();

      request({
        request: 'allTaggedKeys',
        value: this.value
      });      
    }
    else if (this.id === 'nav-tags') {
      currentDatasource = 'tagdb';
      $visualizations.hide();
      keyListUpdate();
    }
    else if (this.id == 'nav-fav') {
      currentDatasource = 'favdb';
      $visualizations.hide();
      keyListUpdate();
    }

    $selectOne.show();

  });

  //
  // when a user selects a single item from the key list
  //
  $keyList.on('change', function() {

    var values = [];

    $keyList.find('option:selected').each(function(key){
      values.push({ type: 'del', key: this.value });
    });

    if (values.length > 1) {

      $selectOne.show();
    }
    else {

      $selectOne.hide();
      currentSelection = this.value;

      request({
        request: 'editorUpdate', 
        value: this.value 
      });
    }
  });

  //
  // when a user wants to delete one or more keys from the key list
  //
  $('#delete-keys').on('click', function() {

    var operations = [];

    $keyList.find('option:selected').each(function(key){
      operations.push({ type: 'del', key: this.value });
    });

    var value = { operations: operations, opts: getOpts() };

    request({
      request: 'deleteValues',
      value: value
    });

    $selectOne.show();
  });

  //
  // when the user wants to do more than just find a key.
  //
  $('#range').on('click', function() {

    if ($('#range:checked').length === 0) {
      $('#endKeyContainer').hide();
      $('#startKeyContainer .add-on').text('Search');
      $('#keyListContainer').removeClass('extended-options');
    }
    else {
      $('#endKeyContainer').show();
      $('#startKeyContainer .add-on').text('Start');
      $('#keyListContainer').addClass('extended-options');
    }
  });

  //
  // when the user wants to favorite the currently selected keys
  //
  $('#addto-favs').click(function() {

    request({
      request: 'favKeys',
      value: getSelectedKeys()
    });
  });

  //
  // when the user wants to tag the currently selected keys
  //
  $('#addto-tags').click(function() {
    
    request({
      request: 'tagKeys',
      value: getSelectedKeys()
    });
  });

  //
  // when a user is trying to enter query criteria
  //
  $controls.on('keyup mouseup click', keyListUpdate);


  //
  // visualizations stuff
  //
  var $visualizationLinks = $('#visualizations .left a');

  $visualizationLinks.on('click', function() {
    $selectKeys.hide();
    $visualizationLinks.each(function() {
      $(this).removeClass('selected');
    });
    $(this).addClass('selected');
  });


  //
  // build the editor
  //
  var editor_json = CodeMirror.fromTextArea(document.getElementById("code-json"), {
    lineNumbers: true,
    mode: "application/json",
    gutters: ["CodeMirror-lint-markers"],
    lintWith: CodeMirror.jsonValidator,
    viewportMargin: Infinity
  });

  //
  // if the data changes, save it when its valid
  //
  var saveBounce;
  editor_json.on('change', function(cm, change) {

    clearTimeout(saveBounce);
    saveBounce = setTimeout(function() {

      if(cm._lintState.marked.length === 0 && cm.doc.isClean() === false) {

        var value = { 
          key: currentSelection,
          value: JSON.parse(editor_json.doc.getValue())
        };

        request({
          request: 'updateValue',
          value: value
        });
      }

    }, 800);

  });


  //
  // Hexagonal/Historic/Aggregate View
  //

  // var largestKey = 0;

  // for(var i = 0, l = keys.length; i<l; i++) {
  //   if (keys[i].size > largestKey) {
  //     largestKey = keys.size;
  //   }
  // }

  // var margin = {top: 20, right: 20, bottom: 30, left: 40},
  //     width = 460 - margin.left - margin.right,
  //     height = 500 - margin.top - margin.bottom;

  // var points = [
  //       [100, 50],
  //       [0, 0],
  //       [100, 50],
  //       [100, 50],
  //       [100, 50]
  //     ];

  //     // d3.range(2000).map(function() { return [randomX(), randomY()]; });

  // var color = d3.scale.linear()
  //     .domain([0, 20])
  //     .range(["white", "steelblue"]) // #3c7cd4
  //     .interpolate(d3.interpolateLab);

  // var hexbin = d3.hexbin()
  //     .size([width, height])
  //     .radius(20);

  // var x = d3.scale.identity()
  //     .domain([0, width]);

  // var y = d3.scale.linear()
  //     .domain([0, height])
  //     .range([height, 0]);

  // var xAxis = d3.svg.axis()
  //     .scale(x)
  //     .orient("bottom")
  //     .tickSize(6, -height);

  // var yAxis = d3.svg.axis()
  //     .scale(y)
  //     .orient("left")
  //     .tickSize(6, -width);

  // var svg = d3.select("#vis-historic-data").append("svg")
  //     .attr("width", width + margin.left + margin.right)
  //     .attr("height", height + margin.top + margin.bottom)
  //   .append("g")
  //     .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  // svg.append("clipPath")
  //     .attr("id", "clip")
  //   .append("rect")
  //     .attr("class", "mesh")
  //     .attr("width", width)
  //     .attr("height", height);

  // svg.append("g")
  //     .attr("clip-path", "url(#clip)")
  //   .selectAll(".hexagon")
  //     .data(hexbin(points))
  //   .enter().append("path")
  //     .attr("class", "hexagon")
  //     .attr("d", hexbin.hexagon())
  //     .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
  //     .style("fill", function(d) { return color(d.length); });

  // svg.append("g")
  //     .attr("class", "y axis")
  //     .call(yAxis);

  // svg.append("g")
  //     .attr("class", "x axis")
  //     .attr("transform", "translate(0," + height + ")")
  //     .call(xAxis);

  $('#generateTreeMap').on('click', function() {

    request({
      request: 'buildTreeMap',
      value: $('#treeMapToken').val()
    });
  });

  function buildTreeMap(data) {

    $("#vis-tree-map .container").empty();

    var w = $("#vis-tree-map .container").width() - 80,
        h = $("#vis-tree-map .container").height() - 180,
        x = d3.scale.linear().range([0, w]),
        y = d3.scale.linear().range([0, h]),
        color = d3.scale.category20c(),
        root,
        node;

    var treemap = d3.layout.treemap()
        .round(false)
        .size([w, h])
        .sticky(true)
        .value(function(d) { return d.size; });

    var svg = d3.select("#vis-tree-map .container")
        .attr("class", "chart")
      .append("svg:svg")
        .attr("width", w)
        .attr("height", h)
      .append("svg:g")
        .attr("transform", "translate(.5,.5)");
    
      node = root = data;

      var nodes = treemap.nodes(root)
          .filter(function(d) { return !d.children; });

      var cell = svg.selectAll("g")
          .data(nodes)
        .enter().append("svg:g")
          .attr("class", "cell")
          .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
          .on("click", function(d) { return zoom(node == d.parent ? root : d.parent); });

      cell.append("svg:rect")
          .attr("width", function(d) { return d.dx - 1; })
          .attr("height", function(d) { return d.dy - 1; })
          .style("fill", function(d) { return color(d.parent.name); });

      cell.append("svg:text")
          .attr("x", function(d) { return d.dx / 2; })
          .attr("y", function(d) { return d.dy / 2; })
          .attr("dy", ".35em")
          .attr("text-anchor", "middle")
          .text(function(d) { return d.name; })
          .style("opacity", function(d) { d.w = this.getComputedTextLength(); return d.dx > d.w ? 1 : 0; });

      d3.select(window).on("click", function() { zoom(root); });

      d3.select("select").on("change", function() {
        treemap.value(this.value == "size" ? size : count).nodes(root);
        zoom(node);
      });

    function size(d) {
      return d.size;
    }

    function count(d) {
      return 1;
    }

    function zoom(d) {
      var kx = w / d.dx, ky = h / d.dy;
      x.domain([d.x, d.x + d.dx]);
      y.domain([d.y, d.y + d.dy]);

      var t = svg.selectAll("g.cell").transition()
          .duration(d3.event.altKey ? 7500 : 750)
          .attr("transform", function(d) { return "translate(" + x(d.x) + "," + y(d.y) + ")"; });

      t.select("rect")
          .attr("width", function(d) { return kx * d.dx - 1; })
          .attr("height", function(d) { return ky * d.dy - 1; })

      t.select("text")
          .attr("x", function(d) { return kx * d.dx / 2; })
          .attr("y", function(d) { return ky * d.dy / 2; })
          .style("opacity", function(d) { return kx * d.dx > d.w ? 1 : 0; });

      node = d;
      d3.event.stopPropagation();
    }
  }

});
