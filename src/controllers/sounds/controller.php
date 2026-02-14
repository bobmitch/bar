<?php
use HoltBosse\Alba\Core\{CMS, Content, Controller};
use HoltBosse\DB\DB;

CMS::Instance()->page->view_configuration_object = json_decode(CMS::Instance()->page->view_configuration);

$segments = CMS::Instance()->uri_segments;

$view = Content::get_view_location(CMS::Instance()->page->view);
$user = CMS::Instance()->user;

echo "<h1>Sounds Controller</h1>";

// $controller = new Controller(realpath(dirname(__FILE__)),$view);
// $controller->load_view($view); 