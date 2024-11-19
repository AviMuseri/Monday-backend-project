import Cryptr from 'cryptr'
import bcrypt from 'bcrypt'
import { OAuth2Client } from 'google-auth-library';
import { userService } from '../user/user.service.js'
import { logger } from '../../services/logger.service.js'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const cryptr = new Cryptr(process.env.SECRET || 'Secret-Puk-1234')

export const authService = {
	signup,
	login,
	getLoginToken,
	validateToken,
	verifyGoogleToken
}

async function login(username, password) {
	logger.debug(`auth.service - login with username: ${username}`)

	const user = await userService.getByUsername(username)
	if (!user) return Promise.reject('Invalid username or password')

	// TODO: un-comment for real login
	// const match = await bcrypt.compare(password, user.password)
	// if (!match) return Promise.reject('Invalid username or password')

	delete user.password
	user._id = user._id.toString()
	return user
}

async function signup({ username, password, fullname, imgUrl, isAdmin }) {
	const saltRounds = 10

	logger.debug(`auth.service - signup with username: ${username}, fullname: ${fullname}`)
	if (!username || !password || !fullname) return Promise.reject('Missing required signup information')

	const userExist = await userService.getByUsername(username)
	if (userExist) return Promise.reject('Username already taken')

	const hash = await bcrypt.hash(password, saltRounds)
	return userService.add({ username, password: hash, fullname, imgUrl, isAdmin })
}

function getLoginToken(user) {
	const userInfo = {
		_id: user._id,
		fullname: user.fullname,
		imgUrl: user.imgUrl,
		isAdmin: user.isAdmin,
	}
	return cryptr.encrypt(JSON.stringify(userInfo))
}

function validateToken(loginToken) {
	try {
		const json = cryptr.decrypt(loginToken)
		const loggedinUser = JSON.parse(json)
		return loggedinUser
	} catch (err) {
		console.log('Invalid login token')
	}
	return null
}

async function verifyGoogleToken(token) {

	try {
		const ticket = await client.verifyIdToken({
			idToken: token,
			audience: process.env.GOOGLE_CLIENT_ID,
		});
		const payload = ticket.getPayload()

		const userToAdd = {
			googleId: payload.sub,
			email: payload.email,
			fullname: payload.name,
			imgUrl: payload.picture,
		}

		if (!userToAdd) {
			throw new Error('Invalid token payload');
		}

		// Retrieve or create the user
		let googleUser = await userService.getByGoogleId(userToAdd.googleId)
		if (!googleUser) {
			googleUser = await userService.add(userToAdd) // Create a new user
		}

		return googleUser
	} catch (error) {
		console.error('Error in verifyGoogleToken:', error.message || error)
		throw new Error('Failed to verify Google token or process user data')
	}
}