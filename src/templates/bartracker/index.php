<?php
	use HoltBosse\Alba\Core\{Access, Actions, CMS, Category, Component, Configuration, Content, ContentSearch, Controller, File, Hook, Image, JSON, Mail, Page, Plugin, Tag, Template, User, UserSearch, Widget};
	use HoltBosse\DB\DB;
	$alias = CMS::Instance()->page->alias;
?>

<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="ie=edge">
	<link rel="stylesheet" href="/src/templates/bartracker/style.css">
	<!-- Google tag (gtag.js) -->
	<script async src="https://www.googletagmanager.com/gtag/js?id=G-WP320HP10D"></script>
	<script>
	window.dataLayer = window.dataLayer || [];
	function gtag(){dataLayer.push(arguments);}
	gtag('js', new Date());

	gtag('config', 'G-WP320HP10D');
	</script>
	<!--CMSHEAD-->
</head>
<body class='alias_<?php echo CMS::Instance()->page->alias;?>'>
	<!-- render widget positions --> 
    <?php CMS::Instance()->render_widgets('Top Nav');?>
	<div id='messages'>
	    <?php CMS::Instance()->display_messages();?>
	</div>
    <?php CMS::Instance()->render_widgets('Header');?>
    <?php CMS::Instance()->render_widgets('Above Content');?>
	<?php CMS::Instance()->render_controller();?>
    <?php CMS::Instance()->render_widgets('After Content');?>
    <?php CMS::Instance()->render_widgets('Footer');?>
</body>
</html>