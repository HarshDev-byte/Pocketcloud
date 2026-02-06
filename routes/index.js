const express = require('express');
const router = express.Router();
const { redirectIfAuth } = require('../middleware/auth');

router.get('/', redirectIfAuth, (req, res) => {
  res.render('landing', { title: 'PocketCloud' });
});

module.exports = router;
